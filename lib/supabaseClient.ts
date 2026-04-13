import { createClient } from '@supabase/supabase-js';
import { BACKEND_CONFIG } from '../adapters/config';

/**
 * Safely retrieves environment variables from various possible sources.
 * Prevents crashes if import.meta.env is undefined.
 */
const safeGetEnv = (key: string): string | undefined => {
  try {
    // Check Vite's import.meta.env
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      return (import.meta as any).env[key];
    }
    // Check process.env (for compatibility or if defined in vite.config)
    if (typeof process !== 'undefined' && process.env) {
      return (process.env as any)[key];
    }
  } catch (e) {
    // Fall through
  }
  return undefined;
};


// Helper to detect local dev
const isLocalhost = () => {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }
  if (typeof process !== 'undefined' && process.env && process.env.HOSTNAME) {
    const host = process.env.HOSTNAME;
    return host === 'localhost' || host === '127.0.0.1';
  }
  return false;
};

const isProduction = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.MODE === 'string') {
    return import.meta.env.MODE === 'production';
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    return host !== 'localhost' && host !== '127.0.0.1';
  }
  return false;
};

// Prefer explicit env, but only allow fallback in dev
const SUPABASE_URL = safeGetEnv('VITE_SUPABASE_URL') || (isLocalhost() ? BACKEND_CONFIG.supabase.url : '');
const SUPABASE_KEY = safeGetEnv('VITE_SUPABASE_ANON_KEY') || (isLocalhost() ? BACKEND_CONFIG.supabase.key : '');

if ((!SUPABASE_URL || !SUPABASE_KEY) && isProduction() && !isLocalhost()) {
  console.error('[NEXUS_WARNING] Missing Supabase production configuration. Client will not initialize.');
  // Optionally, throw error to prevent app from running:
  // throw new Error('Missing Supabase production configuration');
}
if ((!SUPABASE_URL || !SUPABASE_KEY) && isLocalhost()) {
  console.warn('Nexus OS Warning: Supabase environment variables are missing. System running in localized mock mode.');
}

export const isSupabaseConfigured =
  !!SUPABASE_URL &&
  !!SUPABASE_KEY &&
  !SUPABASE_URL.includes('placeholder') &&
  !SUPABASE_KEY.includes('placeholder') &&
  !SUPABASE_KEY.includes('YOUR_');

// Singleton client instance with fallbacks to avoid crashes
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_KEY || 'placeholder-key'
);

export const createSupabaseClient = () => supabase;
