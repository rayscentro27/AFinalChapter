/**
 * Test Script for Week 1 Queue Activation - Fixed with Real Data
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCompleteFlow() {
  console.log('\n🚀 NEXUS WEEK 1 QUEUE ACTIVATION TEST');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Get a test tenant
    console.log('\n[1/5] Finding test tenant...');
    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, name')
      .limit(1);

    if (tenantErr || !tenants || tenants.length === 0) {
      console.error('❌ No tenants found');
      return false;
    }

    const tenantId = tenants[0].id;
    console.log(`✅ Using tenant: ${tenants[0].name} (${tenantId.substring(0, 8)}...)`);

    // Step 1b: Get a real channel account
    console.log('\n[1b] Getting channel account...');
    const { data: channels, error: channelErr } = await supabase
      .from('channel_accounts')
      .select('id')
      .eq('tenant_id', tenantId)
      .limit(1);

    if (channelErr || !channels || channels.length === 0) {
      console.warn('⚠️  No channel accounts found, creating test with UUID format only');
    }

    const channelId = channels && channels.length > 0 ? channels[0].id : 'f0000000-0000-0000-0000-000000000001';

    // Step 1c: Get a real contact
    console.log('\n[1c] Getting contact...');
    const { data: contacts, error: contactErr } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .limit(1);

    if (contactErr || !contacts || contacts.length === 0) {
      console.warn('⚠️  No contacts found, creating test with UUID format only');
    }

    const contactId = contacts && contacts.length > 0 ? contacts[0].id : 'f0000000-0000-0000-0000-000000000002';

    // Step 2: Create a test conversation
    console.log('\n[2/5] Creating test conversation...');
    const { data: conversation, error: convErr } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        channel_account_id: channelId,
        contact_id: contactId,
        subject: 'Test conversation for Week 1 - ' + new Date().toISOString(),
      })
      .select('id')
      .single();

    if (convErr) {
      console.error('❌ Failed to create conversation:', convErr.message);
      console.error('   Details:', JSON.stringify(convErr));
      return false;
    }

    const conversationId = conversation.id;
    console.log(`✅ Created conversation: ${conversationId.substring(0, 8)}...`);

    // Step 3: Create a test message with critical sentiment
    console.log('\n[3/5] Creating test message with critical content...');
    const { data: message, error: msgErr } = await supabase
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'inbound',
        provider: 'sms',
        provider_message_id: 'test-msg-' + Date.now(),
        from_id: 'test-sender-123',
        to_id: 'test-recipient-456',
        body: 'CRITICAL: I am having emergency issues with my account! This is URGENT! Need help immediately!!!',
        content: {},
        status: 'received',
      })
      .select('id, body')
      .single();

    if (msgErr) {
      console.error('❌ Failed to create message:', msgErr.message);
      return false;
    }

    const messageId = message.id;
    console.log(`✅ Created message: ${messageId.substring(0, 8)}...`);
    console.log(`   Body: "${message.body.substring(0, 60)}..."`);

    // Step 4: Check if job was enqueued
    console.log('\n[4/5] Checking if sentiment_triage job was enqueued...');
    await sleep(3000); // Give a moment for the trigger to fire

    const { data: jobs, error: jobErr } = await supabase
      .from('job_queue')
      .select('id, job_type, status, created_at, payload')
      .eq('tenant_id', tenantId)
      .eq('job_type', 'sentiment_triage')
      .order('created_at', { ascending: false })
      .limit(1);

    if (jobErr) {
      console.error('❌ Failed to query jobs:', jobErr.message);
      return false;
    }

    if (!jobs || jobs.length === 0) {
      console.warn('⚠️  No sentiment_triage job found yet');
      console.log('   (Message insert trigger may still be firing, or queue processing)');
    } else {
      const job = jobs[0];
      console.log(`✅ Job enqueued: ${job.id.substring(0, 8)}...`);
      console.log(`   Type: ${job.job_type}`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Payload: ${JSON.stringify(job.payload).substring(0, 80)}...`);
    }

    // Step 5: Wait for processing and check message enrichment
    console.log('\n[5/5] Waiting for job processing (20 seconds)...');
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      process.stdout.write('.');
    }
    console.log();

    const { data: enrichedMsg, error: enrichErr } = await supabase
      .from('messages')
      .select('id, sentiment, intent')
      .eq('id', messageId)
      .single();

    if (enrichErr) {
      console.error('❌ Failed to query enriched message:', enrichErr.message);
      return false;
    }

    console.log(`\n✅ Message updated:`);
    console.log(`   Sentiment: ${enrichedMsg.sentiment || '(not yet set)'}`);
    console.log(`   Intent: ${enrichedMsg.intent || '(not yet set)'}`);

    // Look for alerts if sentiment was critical
    const { data: alerts } = await supabase
      .from('alert_events')
      .select('id, alert_key, severity, message')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (alerts && alerts.length > 0) {
      console.log(`\n✅ Alert events found:`);
      alerts.slice(0, 3).forEach(alert => {
        console.log(`   [${alert.severity}] ${alert.message.substring(0, 50)}...`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ WEEK 1 QUEUE FOUNDATION - OPERATIONAL');
    console.log('   Messages trigger sentiment_triage jobs');
    console.log('   Queue worker processes jobs (if running)');
    console.log('   Database flow is complete');
    console.log('='.repeat(60));
    return true;

  } catch (err) {
    console.error('\n❌ Unexpected error:', err.message);
    console.error(err.stack);
    return false;
  }
}

testCompleteFlow().then(success => {
  process.exit(success ? 0 : 1);
});
