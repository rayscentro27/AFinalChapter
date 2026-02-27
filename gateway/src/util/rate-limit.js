function parseJwtSub(authorization) {
  const raw = String(authorization || '').trim();
  if (!raw.toLowerCase().startsWith('bearer ')) return null;

  const token = raw.slice(7).trim();
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    const sub = String(payload?.sub || '').trim();
    return sub || null;
  } catch {
    return null;
  }
}

export const WEBHOOK_RATE_LIMIT = {
  max: 120,
  timeWindow: '1 minute',
  keyGenerator: (req) => String(req.ip || req.headers['x-forwarded-for'] || 'unknown-ip'),
};

export const ADMIN_RATE_LIMIT = {
  max: 300,
  timeWindow: '1 minute',
  keyGenerator: (req) => {
    const userId = String(req.user?.id || '').trim();
    if (userId) return `user:${userId}`;

    const fromAuth = parseJwtSub(req.headers?.authorization || req.headers?.Authorization);
    if (fromAuth) return `user:${fromAuth}`;

    return String(req.ip || req.headers['x-forwarded-for'] || 'unknown-ip');
  },
};
