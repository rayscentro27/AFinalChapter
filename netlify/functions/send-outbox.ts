import type { Handler } from '@netlify/functions';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { proxyToOracle } from './_shared/oracle_proxy';

type ProviderInput = 'sms' | 'whatsapp' | 'meta';
type ProviderGateway = 'twilio' | 'whatsapp' | 'meta';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid(),
  provider: z.enum(['sms', 'whatsapp', 'meta']),
  text: z.string().max(4000).optional(),
  to: z.string().min(3).max(64).optional(),
  recipient_id: z.string().min(3).max(128).optional(),
  content: z.record(z.any()).optional(),
  attachments: z.array(z.any()).optional(),
  client_request_id: z.string().min(8).max(128).optional(),
});

const CHANNEL_PROVIDER_MAP: Record<ProviderInput, ProviderGateway> = {
  sms: 'twilio',
  whatsapp: 'whatsapp',
  meta: 'meta',
};

function hasAttachments(content: unknown): boolean {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return false;
  const attachments = (content as any).attachments;
  return Array.isArray(attachments) && attachments.length > 0;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user?.id) return json(401, { error: 'Unauthorized' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const text = String(body.text || '').trim();
    if (!text && !hasAttachments(body.content) && !(Array.isArray(body.attachments) && body.attachments.length > 0)) {
      return json(400, { error: 'Missing text or attachments' });
    }

    const tenantId = await resolveTenantForUser(supabase as any, authData.user.id, body.tenant_id);

    const convo = await loadConversationWithChannel(supabase as any, tenantId, body.conversation_id);

    const expectedChannelProvider = CHANNEL_PROVIDER_MAP[body.provider];
    if (convo.channel_provider !== expectedChannelProvider) {
      return json(400, {
        error: `Provider/channel mismatch. conversation channel is ${convo.channel_provider}, request provider is ${body.provider}`,
      });
    }

    const toAddress = body.provider === 'meta'
      ? (body.recipient_id || body.to || '').trim()
      : (body.to || '').trim();

    if (!toAddress) {
      return json(400, {
        error: body.provider === 'meta'
          ? 'Missing recipient_id for meta'
          : `Missing to for ${body.provider}`,
      });
    }

    const clientRequestId = body.client_request_id || randomUUID();

    const proxyResponse = await proxyToOracle({
      path: '/send/outbox',
      method: 'POST',
      body: {
        tenant_id: tenantId,
        conversation_id: body.conversation_id,
        provider: expectedChannelProvider,
        channel_account_id: convo.channel_account_id,
        to_address: toAddress,
        body: text || null,
        content: body.content || { type: 'text' },
        attachments: body.attachments || undefined,
        client_request_id: clientRequestId,
        created_by: authData.user.id,
      },
    });

    const responseJson = proxyResponse.json || {};
    if (!proxyResponse.ok) {
      return json(proxyResponse.status, {
        ok: false,
        error: String(responseJson?.error || `Gateway outbox send failed (${proxyResponse.status})`),
        details: responseJson?.details || null,
        outbox: responseJson?.outbox || null,
      });
    }

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      conversation_id: body.conversation_id,
      provider: body.provider,
      client_request_id: clientRequestId,
      outbox: responseJson?.outbox || null,
      message_id: responseJson?.message_id || null,
      provider_message_id: responseJson?.provider_message_id || responseJson?.provider_message_id_real || null,
      provider_message_id_real: responseJson?.provider_message_id_real || responseJson?.provider_message_id || null,
      raw: responseJson?.raw || null,
      deduped: Boolean(responseJson?.deduped),
      send_attempted: Boolean(responseJson?.send_attempted),
      error: responseJson?.error || null,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

async function resolveTenantForUser(
  supabase: any,
  userId: string,
  requestedTenantId?: string
): Promise<string> {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to resolve tenant membership: ${error.message}`);

  const tenantIds: string[] = Array.from(new Set((data || []).map((r: any) => String(r.tenant_id)).filter(Boolean)));
  if (!tenantIds.length) throw statusError(403, 'No tenant membership found for user');

  if (requestedTenantId) {
    if (!tenantIds.includes(requestedTenantId)) {
      throw statusError(403, 'Requested tenant_id is not accessible by current user');
    }
    return requestedTenantId;
  }

  if (tenantIds.length > 1) {
    throw statusError(400, 'Multiple tenants found for user; provide tenant_id');
  }

  return tenantIds[0];
}

async function loadConversationWithChannel(supabase: any, tenantId: string, conversationId: string) {
  const { data: convo, error: convoErr } = await supabase
    .from('conversations')
    .select('id, tenant_id, channel_account_id')
    .eq('tenant_id', tenantId)
    .eq('id', conversationId)
    .single();

  if (convoErr || !convo) throw statusError(404, 'Conversation not found for tenant');

  const { data: channel, error: chErr } = await supabase
    .from('channel_accounts')
    .select('id, provider, external_account_id, is_active')
    .eq('tenant_id', tenantId)
    .eq('id', convo.channel_account_id)
    .eq('is_active', true)
    .single();

  if (chErr || !channel) throw statusError(404, 'Channel account not found or inactive');

  return {
    conversation_id: convo.id,
    channel_account_id: convo.channel_account_id,
    channel_provider: String(channel.provider || ''),
    channel_external_account_id: String(channel.external_account_id || ''),
  };
}

function statusError(statusCode: number, message: string) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
