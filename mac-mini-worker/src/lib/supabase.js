import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnv() {
  try {
    const envPath = new URL('../../.env', import.meta.url);
    const envFile = readFileSync(envPath, 'utf-8');
    const lines = envFile.split('\n');
    const env = {};
    
    for (const line of lines) {
      if (!line || line.startsWith('#')) continue;
      const [key, ...valueParts] = line.split('=');
      if (key) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
    
    return env;
  } catch (err) {
    console.warn('Failed to load .env file, using process.env');
    return process.env;
  }
}

const EnvConfig = {
  ...loadEnv(),
  ...process.env
};

export function getEnv(key, defaultValue = null) {
  return EnvConfig[key] ?? defaultValue;
}

export const SUPABASE_URL = getEnv('SUPABASE_URL');
export const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Please configure .env file');
  process.exit(1);
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default {
  supabaseAdmin,
  getEnv,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
};
