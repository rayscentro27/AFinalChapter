import { createClient } from '@supabase/supabase-js';

export function getUserSupabaseClient(event: { headers?: Record<string, string | undefined> }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Server misconfigured: missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  const auth = Object.entries(event.headers || {}).find(([k]) => k.toLowerCase() === 'authorization')?.[1];
  if (!auth || !String(auth).toLowerCase().startsWith('bearer ')) {
    const err: any = new Error('Missing Authorization bearer token');
    err.statusCode = 401;
    throw err;
  }

  // Use anon key + user JWT so PostgREST enforces RLS.
  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: String(auth),
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
