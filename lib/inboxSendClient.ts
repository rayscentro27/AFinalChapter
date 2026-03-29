import { supabase } from './supabaseClient';

export type SendProvider = 'meta';

export type SendMessageInput = {
  tenant_id?: string;
  conversation_id?: string;
  contact_id?: string;
  body_text: string;
  attachments?: any[];
  content?: Record<string, any>;
  channel_preference?: SendProvider | string;
  provider?: SendProvider;
  idempotency_key?: string;
  client_request_id?: string;
  to?: string;
  recipient_id?: string;
};

export type SendMessageResult = {
  ok: boolean;
  tenant_id?: string;
  conversation_id?: string | null;
  contact_id?: string | null;
  provider?: SendProvider | null;
  channel_account_id?: string | null;
  outbox_id?: string | number | null;
  message_id?: string | number | null;
  provider_message_id?: string | null;
  provider_message_id_real?: string | null;
  status?: string;
  idempotency_key?: string | null;
  to_address?: string | null;
  from_address?: string | null;
  deduped?: boolean;
  error?: string;
  details?: any;
};

const SEND_ENDPOINT = '/.netlify/functions/messages-send';
const PARTICIPANT_NOTIFY_ENDPOINT = '/.netlify/functions/messaging-notify-participants';

export async function sendInboxMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required to send messages');

  const bodyText = String(input.body_text || '').trim();
  const payload = {
    ...input,
    body_text: bodyText,
    client_request_id: input.client_request_id || crypto.randomUUID(),
  };

  const res = await fetch(SEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(json?.error || `messages-send failed (${res.status})`));
  }

  const result = json as SendMessageResult;

  // Best-effort participant notifications (Phase 2): do not block send success.
  if (result.ok && result.message_id && (result.tenant_id || input.tenant_id) && (result.conversation_id || input.conversation_id)) {
    void notifyParticipantsBestEffort({
      token,
      tenant_id: String(result.tenant_id || input.tenant_id),
      conversation_id: String(result.conversation_id || input.conversation_id),
      message_id: String(result.message_id),
      preview: bodyText.slice(0, 180),
    });
  }

  return result;
}

async function notifyParticipantsBestEffort(input: {
  token: string;
  tenant_id: string;
  conversation_id: string;
  message_id: string;
  preview?: string;
}) {
  try {
    await fetch(PARTICIPANT_NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.token}`,
      },
      body: JSON.stringify({
        tenant_id: input.tenant_id,
        conversation_id: input.conversation_id,
        message_id: input.message_id,
        preview: input.preview,
      }),
    });
  } catch {
    // Non-fatal: message send must remain the source of truth.
  }
}
