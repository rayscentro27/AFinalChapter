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

// Prefer explicit env, but fall back to shared app config defaults so prod
// does not silently degrade into mock mode when VITE env injection is missing.
const SUPABASE_URL = safeGetEnv('VITE_SUPABASE_URL') || BACKEND_CONFIG.supabase.url;
const SUPABASE_KEY = safeGetEnv('VITE_SUPABASE_ANON_KEY') || BACKEND_CONFIG.supabase.key;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn("Nexus OS Warning: Supabase environment variables are missing. System running in localized mock mode.");
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
