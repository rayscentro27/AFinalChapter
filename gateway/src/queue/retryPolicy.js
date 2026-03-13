function asInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export function nextRetryAt({ attemptCount = 0, baseDelaySeconds = 15, maxDelaySeconds = 600 }) {
  const attempts = Math.max(0, asInt(attemptCount, 0));
  const base = Math.max(1, asInt(baseDelaySeconds, 15));
  const max = Math.max(base, asInt(maxDelaySeconds, 600));

  const exp = Math.min(max, base * (2 ** attempts));
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exp * 0.2)));
  const delay = Math.min(max, exp + jitter);

  return new Date(Date.now() + (delay * 1000)).toISOString();
}

export function shouldMoveToDeadLetter({ attemptCount = 0, maxAttempts = 5 }) {
  const attempts = Math.max(0, asInt(attemptCount, 0));
  const max = Math.max(1, asInt(maxAttempts, 5));
  return attempts >= max;
}
