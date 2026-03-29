import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { resolveTenantId } from './_shared/tenant_resolve';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid(),
  message_id: z.union([z.string().uuid(), z.number().int()]),
  sender_user_id: z.string().uuid().optional(),
  preview: z.string().max(500).optional(),
});

type PrefRow = {
  tenant_id: string;
  user_id: string;
  email_enabled?: boolean | null;
  cooldown_minutes?: number | null;
  last_notified_at?: string | null;
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const userSupabase = getUserSupabaseClient(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const { data: authData, error: authErr } = await userSupabase.auth.getUser();
    if (authErr || !authData?.user?.id) return json(401, { ok: false, error: 'unauthorized' });

    const tenantId = await resolveTenantId(userSupabase as any, { requestedTenantId: body.tenant_id });

    // Ensure caller can access this thread via RLS.
    const { data: convo, error: convoErr } = await userSupabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', body.conversation_id)
      .maybeSingle();

    if (convoErr) throw new Error(convoErr.message || 'conversation_access_check_failed');
    if (!convo?.id) return json(403, { ok: false, error: 'conversation_not_accessible' });

    const senderUserId = body.sender_user_id || authData.user.id;
    const admin = getAdminSupabaseClient();

    const participantsRes = await admin
      .from('conversation_user_participants')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', body.conversation_id);

    if (participantsRes.error) {
      // If migration has not been applied yet, fail soft.
      if (isMissingRelation(participantsRes.error)) {
        return json(200, { ok: true, notified: 0, skipped: 0, reason: 'participants_table_missing' });
      }
      throw new Error(participantsRes.error.message || 'participants_query_failed');
    }

    const recipientIds = Array.from(
      new Set(
        (participantsRes.data || [])
          .map((row: any) => String(row?.user_id || ''))
          .filter((id) => Boolean(id) && id !== senderUserId)
      )
    );

    if (recipientIds.length === 0) {
      return json(200, { ok: true, notified: 0, skipped: 0, reason: 'no_other_participants' });
    }

    const profileRes = await admin
      .from('profiles')
      .select('user_id, email, display_name, full_name')
      .in('user_id', recipientIds);

    if (profileRes.error) throw new Error(profileRes.error.message || 'profiles_query_failed');

    const prefsRes = await admin
      .from('message_notification_preferences')
      .select('tenant_id, user_id, email_enabled, cooldown_minutes, last_notified_at')
      .eq('tenant_id', tenantId)
      .in('user_id', recipientIds);

    const prefsRows: PrefRow[] = prefsRes.error ? [] : ((prefsRes.data || []) as PrefRow[]);
    const prefByUser = new Map<string, PrefRow>();
    for (const row of prefsRows) prefByUser.set(String(row.user_id), row);

    const messageRes = await admin
      .from('messages')
      .select('id, body, created_at')
      .eq('tenant_id', tenantId)
      .eq('id', body.message_id)
      .maybeSingle();

    const preview = String(body.preview || messageRes.data?.body || '').trim().slice(0, 180);

    const authHeader = getAuthHeader(event.headers);
    const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

    let notified = 0;
    let skipped = 0;

    for (const profile of profileRes.data || []) {
      const recipientId = String((profile as any)?.user_id || '');
      const recipientEmail = String((profile as any)?.email || '').trim().toLowerCase();
      if (!recipientId || !recipientEmail) {
        skipped += 1;
        continue;
      }

      const pref = prefByUser.get(recipientId);
      const emailEnabled = pref?.email_enabled !== false;
      const cooldownMinutes = Number(pref?.cooldown_minutes || 15);
      const lastNotifiedAt = pref?.last_notified_at ? new Date(pref.last_notified_at).getTime() : 0;
      const now = Date.now();

      if (!emailEnabled) {
        skipped += 1;
        await insertNotificationLogSafe(admin, {
          tenant_id: tenantId,
          conversation_id: body.conversation_id,
          message_id: String(body.message_id),
          recipient_user_id: recipientId,
          channel: 'email',
          status: 'email_disabled',
          detail: { reason: 'recipient_opt_out' },
        });
        continue;
      }

      if (lastNotifiedAt > 0 && now - lastNotifiedAt < cooldownMinutes * 60_000) {
        skipped += 1;
        await insertNotificationLogSafe(admin, {
          tenant_id: tenantId,
          conversation_id: body.conversation_id,
          message_id: String(body.message_id),
          recipient_user_id: recipientId,
          channel: 'email',
          status: 'cooldown_skipped',
          detail: { cooldown_minutes: cooldownMinutes },
        });
        continue;
      }

      let deliveryStatus = 'queued';
      let deliveryError: string | null = null;

      if (supabaseUrl && anonKey && authHeader) {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/email-orchestrator/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: authHeader,
              apikey: anonKey,
            },
            body: JSON.stringify({
              tenant_id: tenantId,
              message_type: 'alerts',
              to: recipientEmail,
              subject: 'New secure portal message',
              text: buildNotificationText(preview),
              html: buildNotificationHtml(preview),
              template_key: 'portal_message_notification',
              user_id: recipientId,
              data: {
                conversation_id: body.conversation_id,
                message_id: body.message_id,
                sender_user_id: senderUserId,
              },
            }),
          });

          deliveryStatus = response.ok ? 'sent' : 'failed';
          if (!response.ok) deliveryError = `email_orchestrator_${response.status}`;
        } catch (error: any) {
          deliveryStatus = 'failed';
          deliveryError = String(error?.message || 'email_send_failed');
        }
      } else {
        deliveryStatus = 'failed';
        deliveryError = 'missing_email_orchestrator_env';
      }

      if (deliveryStatus === 'sent') {
        notified += 1;
        await upsertPreferenceTimestampSafe(admin, tenantId, recipientId);
      } else {
        skipped += 1;
      }

      await insertNotificationLogSafe(admin, {
        tenant_id: tenantId,
        conversation_id: body.conversation_id,
        message_id: String(body.message_id),
        recipient_user_id: recipientId,
        channel: 'email',
        status: deliveryStatus,
        detail: { error: deliveryError, preview },
      });
    }

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      conversation_id: body.conversation_id,
      message_id: body.message_id,
      notified,
      skipped,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { ok: false, error: e?.message || 'bad_request' });
  }
};

function buildNotificationText(preview: string) {
  if (!preview) return 'You have a new secure portal message. Sign in to view and reply.';
  return `You have a new secure portal message. Preview: ${preview}`;
}

function buildNotificationHtml(preview: string) {
  const safePreview = escapeHtml(preview || 'You have a new secure portal message. Sign in to view and reply.');
  return `<p>You have a new secure portal message.</p><p><strong>Preview:</strong> ${safePreview}</p>`;
}

function escapeHtml(input: string) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAuthHeader(headers?: Record<string, string | undefined>) {
  const auth = Object.entries(headers || {}).find(([k]) => String(k || '').toLowerCase() === 'authorization')?.[1] || '';
  return String(auth || '').trim();
}

function isMissingRelation(error: any) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return code === '42P01' || msg.includes('relation') || msg.includes('does not exist');
}

async function upsertPreferenceTimestampSafe(admin: any, tenantId: string, userId: string) {
  const now = new Date().toISOString();
  await admin
    .from('message_notification_preferences')
    .upsert({
      tenant_id: tenantId,
      user_id: userId,
      last_notified_at: now,
      updated_at: now,
    }, { onConflict: 'tenant_id,user_id' });
}

async function insertNotificationLogSafe(admin: any, row: {
  tenant_id: string;
  conversation_id: string;
  message_id: string;
  recipient_user_id: string;
  channel: string;
  status: string;
  detail: any;
}) {
  const result = await admin
    .from('message_notification_log')
    .insert(row as any);

  if (result.error && !isMissingRelation(result.error)) {
    console.warn('message_notification_log insert failed:', result.error.message);
  }
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}
