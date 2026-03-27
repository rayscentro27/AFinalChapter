
export type BackendMode = 'mvp_mock' | 'supabase';

const getHostname = (): string => {
  try {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return String(window.location.hostname).toLowerCase();
    }
  } catch (e) {}
  return '';
};

const isNetlifyDraftHost = (hostname: string): boolean => {
  return hostname.includes('--') && hostname.endsWith('.netlify.app');
};

const getEnvVar = (key: string, fallback: string): string => {
  try {
    // Check for Vite specific env vars first
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      const viteKey = key.startsWith('VITE_') ? key : `VITE_${key}`;
      const env = import.meta.env as Record<string, string | boolean | undefined>;
      const rawValue = env[viteKey] ?? env[key];
      if (typeof rawValue === 'string') return rawValue;
      if (typeof rawValue === 'boolean') return String(rawValue);
      return fallback;
    }
    
    // Fallback to process.env (handled by vite.config define)
    if (typeof process !== 'undefined' && process.env) {
        return (process.env as any)[key] || fallback;
    }
  } catch (e) {}
  return fallback;
};

// Netlify draft review hosts use mock mode so manual-review deploys are not blocked by production auth/captcha policy.
const runtimeHostname = getHostname();
const activeMode = isNetlifyDraftHost(runtimeHostname)
  ? 'mvp_mock'
  : getEnvVar('VITE_BACKEND_MODE', 'supabase');

export const BACKEND_CONFIG = {
  mode: activeMode as BackendMode,
  env: isNetlifyDraftHost(runtimeHostname) ? 'review' : getEnvVar('VITE_ENV_NAME', 'production'),
  showDemoBanner: isNetlifyDraftHost(runtimeHostname) || getEnvVar('VITE_DEMO_BANNER', 'false') === 'true',
  aiEnabled: true,
  supabase: {
      url: getEnvVar('VITE_SUPABASE_URL', 'https://ftxbphwlqskimdnqcfxh.supabase.co'),
      key: getEnvVar('VITE_SUPABASE_ANON_KEY', 'sb_publishable_xaK6HiHDVSzOo5qJgwSdNQ_jxxeAuRi')
  },
  stripe: {
    publicKey: getEnvVar('VITE_STRIPE_PUBLIC_KEY', 'YOUR_STRIPE_PUBLIC_KEY'),
    secretKey: localStorage.getItem('nexus_stripe_sk') || ''
  },
  plaid: {
    clientId: getEnvVar('VITE_PLAID_CLIENT_ID', ''),
    secret: getEnvVar('VITE_PLAID_SECRET', '')
  }
};
