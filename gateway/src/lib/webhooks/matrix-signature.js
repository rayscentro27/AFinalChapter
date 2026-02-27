function getHeader(headers, name) {
  const target = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key || '').toLowerCase() === target) return String(value || '').trim();
  }
  return '';
}

export function verifyMatrixWebhookToken({ headers, token }) {
  const configured = String(token || '').trim();
  if (!configured) return true;

  const incoming = getHeader(headers, 'x-matrix-token');
  if (!incoming) return false;
  return incoming === configured;
}
