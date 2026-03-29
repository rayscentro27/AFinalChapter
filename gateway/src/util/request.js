export function getPublicRequestUrl(req) {
  const forwardedProto = (req.headers['x-forwarded-proto'] || '')
    .toString()
    .split(',')[0]
    .trim();
  const forwardedHost = (req.headers['x-forwarded-host'] || '')
    .toString()
    .split(',')[0]
    .trim();

  const protocol = forwardedProto || req.protocol || 'https';
  const host = forwardedHost || req.headers.host || req.hostname;

  return `${protocol}://${host}${req.raw.url}`;
}

export function getSourceIp(req) {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
    req.ip ||
    null
  );
}
