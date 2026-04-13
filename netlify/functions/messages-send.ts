import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { ensurePortalThreadAndInsertMessage } from './_shared/portal_chat_store';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import { proxyToOracle } from './_shared/oracle_proxy';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  conversation_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  body_text: z.string().max(4000).optional(),
  text: z.string().max(4000).optional(),
  attachments: z.array(z.any()).optional(),
  content: z.record(z.any()).optional(),
  provider: z.enum(['meta', 'nexus_chat']).optional(),
  channel_preference: z.string().max(120).optional(),
  identity_id: z.union([z.string(), z.number()]).optional(),
  idempotency_key: z.string().min(8).max(256).optional(),
  client_request_id: z.string().min(8).max(256).optional(),
  to_address: z.string().max(256).optional(),
  to: z.string().max(256).optional(),
  recipient_id: z.string().max(256).optional(),
});

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function hasAttachments(payload: z.infer<typeof BodySchema>) {
  if (Array.isArray(payload.attachments) && payload.attachments.length > 0) return true;
  if (payload.content && Array.isArray((payload.content as any).attachments) && (payload.content as any).attachments.length > 0) return true;
  return false;
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

async function resolveTenantMembershipRole(event: Parameters<Handler>[0], tenantId: string): Promise<string> {
  const supabase = getUserSupabaseClient(event);
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return '';

  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (!message.includes('relation') && !message.includes('does not exist')) {
      throw error;
    }
    const fallback = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fallback.error) throw fallback.error;
    return String(fallback.data?.role || '').toLowerCase();
  }

  return String(data?.role || '').toLowerCase();
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    if (!body.conversation_id && !body.contact_id) {
      return json(400, { ok: false, error: 'missing_contact_id_or_conversation_id' });
    }

    const bodyText = String(body.body_text || body.text || '').trim();
    if (!bodyText && !hasAttachments(body)) {
      return json(400, { ok: false, error: 'missing_body_text_or_attachments' });
    }

    const selectedProvider = body.provider || (body.channel_preference === 'nexus_chat' ? 'nexus_chat' : 'meta');

    if (selectedProvider === 'nexus_chat') {
      const userSupabase = getUserSupabaseClient(event);
      const adminSupabase = getAdminSupabaseClient();
      const contactId = String(body.contact_id || '').trim();
      if (!contactId) {
        return json(400, { ok: false, error: 'missing_contact_id' });
      }

      const { data: authUser } = await userSupabase.auth.getUser();
      const authEmail = normalizeEmail(authUser?.user?.email);
      if (!authEmail) {
        return json(401, { ok: false, error: 'missing_authenticated_email' });
      }

      const contactLookup = await adminSupabase
        .from('contacts')
        .select('id, tenant_id, email, primary_email')
        .eq('id', contactId)
        .maybeSingle();

      if (contactLookup.error) {
        return json(400, { ok: false, error: contactLookup.error.message });
      }
      if (!contactLookup.data) {
        return json(404, { ok: false, error: 'contact_not_found' });
      }

      const contactTenantId = String(contactLookup.data.tenant_id || '').trim();

      let tenantId = '';
      let portalClientFallback = false;
      try {
        tenantId = await resolveTenantId(userSupabase as any, { requestedTenantId: body.tenant_id });
      } catch (resolveError: any) {
        const statusCode = Number(resolveError?.statusCode) || 0;
        const fallbackAllowed = statusCode === 400 || statusCode === 403 || /tenant membership/i.test(String(resolveError?.message || ''));
        if (!fallbackAllowed) {
          throw resolveError;
        }
        if (!contactTenantId) {
          throw resolveError;
        }
        const contactEmails = new Set([
          normalizeEmail(contactLookup.data.email),
          normalizeEmail(contactLookup.data.primary_email),
        ].filter(Boolean));
        if (!contactEmails.has(authEmail)) {
          return json(403, { ok: false, error: 'portal_contact_email_mismatch' });
        }
        if (body.tenant_id && String(body.tenant_id).trim() !== contactTenantId) {
          return json(403, { ok: false, error: 'requested_tenant_does_not_match_contact' });
        }
        tenantId = contactTenantId;
        portalClientFallback = true;
      }

      if (tenantId !== contactTenantId) {
        return json(403, { ok: false, error: 'requested_tenant_does_not_match_contact' });
      }

      const resolvedRole = portalClientFallback ? 'client' : await resolveTenantMembershipRole(event, tenantId);
      const direction = resolvedRole === 'client' || resolvedRole === 'partner' ? 'in' : 'out';
      const senderId = String(authUser?.user?.id || '').trim();
      const portalParticipantId = `portal:${tenantId}`;

      const result = await ensurePortalThreadAndInsertMessage(adminSupabase, {
        tenantId,
        contactId,
        conversationId: body.conversation_id || undefined,
        direction,
        bodyText,
        providerMessageId: body.client_request_id || body.idempotency_key || undefined,
        providerMessageIdReal: body.client_request_id || body.idempotency_key || undefined,
        fromId: direction === 'in' ? contactId : (senderId || portalParticipantId),
        toId: direction === 'in' ? portalParticipantId : contactId,
        attachments: body.attachments,
        content: body.content,
        status: direction === 'in' ? 'received' : 'sent',
      });

      return json(200, {
        ok: true,
        tenant_id: tenantId,
        conversation_id: result.conversation.id,
        contact_id: contactId,
        provider: 'nexus_chat',
        channel_account_id: result.conversation.channel_account_id,
        message_id: result.message.id,
        provider_message_id: result.message.provider_message_id,
        provider_message_id_real: result.message.provider_message_id_real,
        status: result.message.status,
        idempotency_key: body.client_request_id || body.idempotency_key || null,
        to_address: direction === 'in' ? portalParticipantId : contactId,
        from_address: direction === 'in' ? contactId : (senderId || portalParticipantId),
      });
    }

    const proxied = await proxyToOracle({
      path: '/messages/send',
      method: 'POST',
      body: {
        tenant_id: body.tenant_id,
        conversation_id: body.conversation_id,
        contact_id: body.contact_id,
        body_text: bodyText || null,
        attachments: body.attachments,
        content: body.content,
        provider: body.provider,
        channel_preference: body.channel_preference,
        identity_id: body.identity_id,
        idempotency_key: body.idempotency_key,
        client_request_id: body.client_request_id,
        to_address: body.to_address,
        to: body.to,
        recipient_id: body.recipient_id,
      },
      forwardAuth: true,
      event,
    });

    return json(proxied.status, proxied.json || {});
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    return json(statusCode, { ok: false, error: String(error?.message || 'bad_request') });
  }
};
