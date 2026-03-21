import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Test 1: Check if job_queue table exists and has data
async function testJobQueue() {
  console.log('\n=== Testing Job Queue Table ===');
  try {
    const { data, error } = await supabase
      .from('job_queue')
      .select('id, tenant_id, job_type, status, created_at')
      .limit(5);

    if (error) {
      console.error('❌ Job queue table error:', error.message);
      return false;
    }

    console.log('✅ Job queue table accessible');
    console.log(`   Found ${data?.length || 0} jobs`);
    if (data && data.length > 0) {
      console.log('   Latest jobs:');
      data.forEach(job => {
        console.log(`   - ${job.job_type} (${job.status}): ${job.id.substring(0, 8)}...`);
      });
    }
    return true;
  } catch (err) {
    console.error('❌ Exception testing job_queue:', err.message);
    return false;
  }
}

// Test 2: Check if messages table exists
async function testMessagesTable() {
  console.log('\n=== Testing Messages Table ===');
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, body, sentiment, intent, created_at')
      .limit(5);

    if (error) {
      console.error('❌ Messages table error:', error.message);
      return false;
    }

    console.log('✅ Messages table accessible');
    console.log(`   Found ${data?.length || 0} messages`);
    if (data && data.length > 0) {
      console.log('   Latest messages:');
      data.forEach(msg => {
        console.log(`   - Body: ${(msg.body || '').substring(0, 40)}... (sentiment: ${msg.sentiment || 'none'})`);
      });
    }
    return true;
  } catch (err) {
    console.error('❌ Exception testing messages:', err.message);
    return false;
  }
}

// Test 3: Insert a test job
async function insertTestJob() {
  console.log('\n=== Inserting Test Job ===');
  try {
    // First, find a valid tenant_id and message_id to use
    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id')
      .limit(1);

    if (tenantErr || !tenants || tenants.length === 0) {
      console.warn('⚠️  No tenants found for test job');
      return false;
    }

    const tenantId = tenants[0].id;

    const { data, error } = await supabase
      .from('job_queue')
      .insert({
        tenant_id: tenantId,
        job_type: 'sentiment_triage',
        payload: {
          message_id: 'test-message-' + Date.now(),
          conversation_id: 'test-conversation',
          provider: 'sms'
        },
        status: 'pending',
      })
      .select('id, job_type, status, created_at')
      .single();

    if (error) {
      console.error('❌ Failed to insert test job:', error.message);
      return false;
    }

    console.log('✅ Test job inserted successfully');
    console.log(`   Job ID: ${data.id}`);
    console.log(`   Type: ${data.job_type}`);
    console.log(`   Status: ${data.status}`);
    return true;
  } catch (err) {
    console.error('❌ Exception inserting test job:', err.message);
    return false;
  }
}

// Test 4: Check alert_events table
async function testAlertsTable() {
  console.log('\n=== Testing Alerts Table ===');
  try {
    const { data, error } = await supabase
      .from('alert_events')
      .select('id, alert_key, severity, status, created_at')
      .limit(5);

    if (error) {
      console.error('❌ Alerts table error:', error.message);
      return false;
    }

    console.log('✅ Alerts table accessible');
    console.log(`   Found ${data?.length || 0} alert events`);
    return true;
  } catch (err) {
    console.error('❌ Exception testing alerts:', err.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('\n🚀 NEXUS FLOW - Queue Foundation Tests');
  console.log('='.repeat(50));
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log('Starting tests...\n');

  const results = {
    jobQueue: await testJobQueue(),
    messages: await testMessagesTable(),
    alerts: await testAlertsTable(),
    testJob: await insertTestJob(),
  };

  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary:');
  console.log(`  Job Queue: ${results.jobQueue ? '✅' : '❌'}`);
  console.log(`  Messages: ${results.messages ? '✅' : '❌'}`);
  console.log(`  Alerts: ${results.alerts ? '✅' : '❌'}`);
  console.log(`  Test Job: ${results.testJob ? '✅' : '❌'}`);

  const allPassed = Object.values(results).every(v => v === true);
  console.log(`\n${allPassed ? '✅ All tests passed!' : '❌ Some tests failed'}`);
  console.log('='.repeat(50));

  process.exit(allPassed ? 0 : 1);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
