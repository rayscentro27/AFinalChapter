import { supabase } from '../lib/supabaseClient';

export type SmsConsentStatus = {
  user_id: string;
  is_opted_in: boolean;
  opted_in_at: string | null;
  opted_out_at: string | null;
  phone_e164: string | null;
  purpose: string[] | null;
  last_method: string | null;
};

export function normalizePhoneToE164(input: string, defaultCountry = 'US'): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const plusPrefixed = raw.startsWith('+') ? raw : '';
  const digitsOnly = raw.replace(/\D/g, '');

  if (plusPrefixed) {
    const normalized = `+${plusPrefixed.replace(/\D/g, '')}`;
    if (/^\+[1-9]\d{7,14}$/.test(normalized)) return normalized;
    return null;
  }

  if (defaultCountry === 'US') {
    if (digitsOnly.length === 10) return `+1${digitsOnly}`;
    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) return `+${digitsOnly}`;
  }

  if (/^[1-9]\d{7,14}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  return null;
}

export async function getSmsConsentStatus(userId: string): Promise<SmsConsentStatus | null> {
  const { data, error } = await supabase.rpc('get_sms_consent_status', { p_user_id: userId });
  if (error) throw new Error(error.message || 'Unable to read SMS consent status.');

  if (Array.isArray(data) && data.length > 0) {
    return data[0] as SmsConsentStatus;
  }

  return {
    user_id: userId,
    is_opted_in: false,
    opted_in_at: null,
    opted_out_at: null,
    phone_e164: null,
    purpose: null,
    last_method: null,
  };
}
