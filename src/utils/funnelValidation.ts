export function isValidEmail(input: string): boolean {
  const value = String(input || '').trim().toLowerCase();
  if (!value || value.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizePhoneToE164(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
    return null;
  }

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}
