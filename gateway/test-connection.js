/**
 * Simple connection test
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function test() {
  console.log('Testing Supabase connection...');
  console.log('URL:', supabaseUrl);

  try {
    // Try to query tenants
    const { data, error, status } = await supabase
      .from('tenants')
      .select('id, name')
      .limit(5);

    if (error) {
      console.log('ERROR:', error);
      console.log('Status:', status);
      return;
    }

    console.log('SUCCESS! Found tenants:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Exception:', err.message);
  }
}

test();
