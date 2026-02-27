export function normalizeE164(phone) {
  if (!phone) return null;
  const s = String(phone).trim();
  if (!s) return null;
  if (!s.startsWith('+')) return s;
  return s;
}
