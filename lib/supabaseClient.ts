
import { createClient } from '@supabase/supabase-js';

// Hardcoded credentials as per user request
const SUPABASE_URL = 'https://ftxbphwlqskimdnqcfxh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xaK6HiHDVSzOo5qJgwSdNQ_jxxeAuRi';

export const isSupabaseConfigured = 
  !!SUPABASE_URL && 
  !!SUPABASE_KEY && 
  !SUPABASE_URL.includes('your-project');

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const createSupabaseClient = () => supabase;
