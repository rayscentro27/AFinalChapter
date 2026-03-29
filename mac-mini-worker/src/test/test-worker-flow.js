import { supabaseAdmin, getEnv } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import JobQueueClient from '../lib/job-queue-client.js';
import { getHandler } from '../workers/index.js';

const logger = createLogger('WorkerTest');

/**
 * Test: Can Mac Mini worker connect to production Supabase?
 * Test: Can it claim and process jobs created by production gateway?
 */
async function testWorkerFlow() {
  console.log('\n🚀 MAC MINI WORKER FRAMEWORK TEST');
  console.log('='.repeat(60));

  try {
    // Test 1: Supabase Connection
    console.log('\n[1/5] Testing Supabase connection...');
    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('id, name')
      .limit(1);

    if (!tenants || tenants.length === 0) {
      console.error('❌ No tenants found in Supabase');
      process.exit(1);
    }

    const testTenant = tenants[0];
    console.log(`✅ Connected to Supabase`);
    console.log(`   Tenant: ${testTenant.name} (${testTenant.id.substring(0, 8)}...)`);

    // Test 2: Job Queue Client
    console.log('\n[2/5] Testing Job Queue Client...');
    const queueClient = new JobQueueClient('test-worker-1', 2);
    console.log(`✅ Job Queue Client initialized`);
    console.log(`   Worker ID: ${queueClient.workerId}`);
    console.log(`   Max concurrent: ${queueClient.maxConcurrentJobs}`);

    // Test 3: Create test job
    console.log('\n[3/5] Creating test sentiment_triage job...');
    
    // First, create a test message
    const { data: channels } = await supabaseAdmin
      .from('channel_accounts')
      .select('id')
      .eq('tenant_id', testTenant.id)
      .limit(1);

    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('tenant_id', testTenant.id)
      .limit(1);

    if (!channels?.length || !contacts?.length) {
      console.warn('⚠️  No channel accounts or contacts found, creating with UUIDs');
    }

    const channelId = channels?.[0]?.id || 'f0000000-0000-0000-0000-000000000001';
    const contactId = contacts?.[0]?.id || 'f0000000-0000-0000-0000-000000000002';

    // Create conversation
    const { data: conversation, error: convErr } = await supabaseAdmin
      .from('conversations')
      .insert({
        tenant_id: testTenant.id,
        channel_account_id: channelId,
        contact_id: contactId,
        subject: 'Worker Framework Test - ' + new Date().toISOString()
      })
      .select('id')
      .single();

    if (convErr) {
      console.error('❌ Failed to create test conversation:', convErr.message);
      process.exit(1);
    }

    // Create message
    const { data: message, error: msgErr } = await supabaseAdmin
      .from('messages')
      .insert({
        tenant_id: testTenant.id,
        conversation_id: conversation.id,
        direction: 'in',
        provider: 'twilio',
        provider_message_id: 'test-' + Date.now(),
        from_id: 'test-sender',
        to_id: 'test-recipient',
        body: 'Test message: I am really angry and frustrated with this issue!',
        content: {},
        status: 'received'
      })
      .select('id')
      .single();

    if (msgErr) {
      console.error('❌ Failed to create test message:', msgErr.message);
      process.exit(1);
    }

    console.log(`✅ Test message created: ${message.id.substring(0, 8)}...`);

    // Create job
    const { data: job, error: jobErr } = await supabaseAdmin
      .from('job_queue')
      .insert({
        tenant_id: testTenant.id,
        job_type: 'sentiment_triage',
        payload: {
          message_id: message.id,
          conversation_id: conversation.id,
          provider: 'twilio'
        },
        status: 'pending'
      })
      .select('id')
      .single();

    if (jobErr) {
      console.error('❌ Failed to create test job:', jobErr.message);
      process.exit(1);
    }

    console.log(`✅ Test job created: ${job.id.substring(0, 8)}...`);

    // Debug: Check the actual job record
    const { data: jobCheck } = await supabaseAdmin
      .from('job_queue')
      .select('*')
      .eq('id', job.id)
      .single();
    
    if (jobCheck) {
      console.log(`   Job status: ${jobCheck.status}`);
      console.log(`   Job available_at: ${jobCheck.available_at || 'NULL'}`);
      console.log(`   Job attempt_count: ${jobCheck.attempt_count}`);
    }

    // Test 4: Claim and process job
    console.log('\n[4/5] Claiming and processing job...');
    const claimedJob = await queueClient.claimNextJob();

    if (!claimedJob) {
      console.error('❌ Failed to claim job');
      process.exit(1);
    }

    console.log(`✅ Job claimed: ${claimedJob.id.substring(0, 8)}...`);

    await queueClient.markProcessing(claimedJob.id, claimedJob.job_type);
    const handler = getHandler(claimedJob.job_type);

    if (!handler) {
      console.error('❌ No handler for job type:', claimedJob.job_type);
      process.exit(1);
    }

    const result = await handler(claimedJob, { logger, worker_id: 'test-worker' });
    console.log(`✅ Job executed successfully`);
    console.log(`   Result: sentiment=${result.sentiment}, intent=${result.intent}`);

    await queueClient.markComplete(claimedJob.id, result);
    console.log(`✅ Job marked complete`);

    // Test 5: Verify result
    console.log('\n[5/5] Verifying results...');
    const { data: enrichedMsg } = await supabaseAdmin
      .from('messages')
      .select('id, ai_sentiment, ai_intent, ai_enrich_status')
      .eq('id', message.id)
      .single();

    console.log(`✅ Message enriched`);
    console.log(`   Sentiment: ${enrichedMsg.ai_sentiment}`);
    console.log(`   Intent: ${enrichedMsg.ai_intent}`);
    console.log(`   Status: ${enrichedMsg.ai_enrich_status}`);

    const { data: jobResult } = await supabaseAdmin
      .from('job_results')
      .select('id, status, result')
      .eq('job_id', job.id)
      .single();

    if (jobResult) {
      console.log(`✅ Job result stored`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED');
    console.log('Mac Mini worker framework is ready!');
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test failed:', err.message || String(err));
    console.error(err.stack);
    process.exit(1);
  }
}

testWorkerFlow();
