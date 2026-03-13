import { supabase } from '../../lib/supabaseClient';
import { BACKEND_CONFIG } from '../../adapters/config';

export type DocuPostAddress = {
  to_name: string;
  to_address_1: string;
  to_address_2?: string;
  to_city: string;
  to_state: string;
  to_zip: string;
};

export type AuthorizeAndSendInput = {
  dispute_packet_id: string;
} & DocuPostAddress;

export type AuthorizeAndSendResult = {
  success: boolean;
  mailing_event_id: string;
  status: 'queued' | 'submitted' | 'sent' | 'failed' | 'canceled';
  provider_reference_id?: string | null;
};

function resolveSupabaseUrl(): string {
  const viteUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL;
  if (viteUrl) return String(viteUrl);
  return String(BACKEND_CONFIG.supabase.url || '');
}

export async function authorizeAndSendDocuPost(input: AuthorizeAndSendInput): Promise<AuthorizeAndSendResult> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Authenticated session required.');

  const supabaseUrl = resolveSupabaseUrl();
  if (!supabaseUrl) throw new Error('Supabase URL is missing from frontend configuration.');

  const response = await fetch(`${supabaseUrl}/functions/v1/docupost-mail/authorize-and-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as any)?.error || 'DocuPost authorization request failed.'));
  }

  return payload as AuthorizeAndSendResult;
}
