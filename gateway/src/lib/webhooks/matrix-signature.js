function getHeader(headers, name) {
  const target = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key || '').toLowerCase() === target) return String(value || '').trim();
  }
  return '';
}

export function verifyMatrixWebhookToken({ headers, token }) {
  const configured = String(token || '').trim();
  // Fail closed: if no token is configured, do not accept Matrix webhooks.
  if (!configured) return false;

  const incoming = getHeader(headers, 'x-matrix-token');
  if (!incoming) return false;
  return incoming === configured;
}
