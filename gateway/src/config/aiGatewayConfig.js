function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asBoolean(value, fallback = false) {
  const normalized = asText(value).toLowerCase();
  if (!normalized) return fallback;
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function parseCsv(value) {
  return asText(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

const rawAllowedOrigins = parseCsv(process.env.ALLOWED_ORIGINS || 'https://app.goclearonline.cc');

export const AI_GATEWAY_CONFIG = {
  NODE_ENV: asText(process.env.NODE_ENV) || 'development',
  ALLOWED_ORIGINS: rawAllowedOrigins,
  GEMINI_API_KEY: asText(process.env.GEMINI_API_KEY),
  OPENROUTER_API_KEY: asText(process.env.OPENROUTER_API_KEY),
  NVIDIA_NIM_API_KEY: asText(process.env.NVIDIA_NIM_API_KEY),
  ENABLE_NIM_DEV: asBoolean(process.env.ENABLE_NIM_DEV, false),
  ALLOW_NETLIFY_PREVIEWS: asBoolean(process.env.ALLOW_NETLIFY_PREVIEWS, true),
};

export function isOriginAllowed(origin) {
  const candidate = asText(origin);
  if (!candidate) return true; // non-browser and same-origin server calls

  if (AI_GATEWAY_CONFIG.ALLOWED_ORIGINS.includes(candidate)) return true;

  if (!AI_GATEWAY_CONFIG.ALLOW_NETLIFY_PREVIEWS) return false;

  // Allow Netlify preview deploy URLs: https://branch--site.netlify.app
  if (/^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/i.test(candidate)) return true;

  return false;
}
