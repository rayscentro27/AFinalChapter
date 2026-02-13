
export type BackendMode = 'mvp_mock' | 'supabase';

const getEnvVar = (key: string, fallback: string): string => {
  try {
    // Check localStorage first for UI-driven overrides
    const override = localStorage.getItem(`nexus_override_${key}`);
    if (override) return override;

    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env[key] || fallback;
    }
    if (typeof process !== 'undefined' && process.env) {
        return (process.env as any)[key] || fallback;
    }
  } catch (e) {}
  return fallback;
};

// Defaulting to supabase as per connection request
const activeMode: BackendMode = 'supabase';

export const BACKEND_CONFIG = {
  mode: activeMode as BackendMode,
  env: getEnvVar('VITE_ENV_NAME', 'production'),
  showDemoBanner: getEnvVar('VITE_DEMO_BANNER', 'false') === 'true',
  aiEnabled: true,
  supabase: {
      url: 'https://ftxbphwlqskimdnqcfxh.supabase.co',
      key: 'sb_publishable_xaK6HiHDVSzOo5qJgwSdNQ_jxxeAuRi'
  },
  stripe: {
    publicKey: getEnvVar('VITE_STRIPE_PUBLIC_KEY', 'YOUR_STRIPE_PUBLIC_KEY'),
    secretKey: localStorage.getItem('nexus_stripe_sk') || ''
  },
  twilio: {
    sid: localStorage.getItem('nexus_override_TWILIO_SID') || '',
    token: localStorage.getItem('nexus_override_TWILIO_TOKEN') || ''
  },
  plaid: {
    clientId: localStorage.getItem('nexus_override_PLAID_CLIENT_ID') || '',
    secret: localStorage.getItem('nexus_override_PLAID_SECRET') || ''
  }
};
