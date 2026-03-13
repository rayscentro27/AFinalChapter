import { supabase } from './supabaseClient';

export type SendProvider = 'sms' | 'whatsapp' | 'meta';

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
  provider?: SendProvider | 'twilio' | 'whatsapp' | 'meta' | null;
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

  return json as SendMessageResult;
}
