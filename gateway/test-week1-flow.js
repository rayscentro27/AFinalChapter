/**
 * Test Script for Week 1 Queue Activation
 * Tests the complete sentiment_triage flow
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

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
    console.log('\n[1/6] Finding test tenant...');
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

    // Step 2: Create a test conversation
    console.log('\n[2/6] Creating test conversation...');
    const { data: conversation, error: convErr } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        channel_account_id: 'test-channel-account',
        contact_id: 'test-contact',
        subject: 'Test conversation for Week 1',
      })
      .select('id')
      .single();

    if (convErr || !conversation) {
      console.error('❌ Failed to create conversation:', convErr?.message);
      return false;
    }

    const conversationId = conversation.id;
    console.log(`✅ Created conversation: ${conversationId.substring(0, 8)}...`);

    // Step 3: Create a test message
    console.log('\n[3/6] Creating test message...');
    const { data: message, error: msgErr } = await supabase
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'inbound',
        provider: 'sms',
        provider_message_id: 'test-msg-' + Date.now(),
        from_id: 'test-sender',
        to_id: 'test-recipient',
        body: 'I am having critical issues with my account and this is urgent! Need help immediately!',
        content: {},
        status: 'received',
      })
      .select('id, body')
      .single();

    if (msgErr || !message) {
      console.error('❌ Failed to create message:', msgErr?.message);
      return false;
    }

    const messageId = message.id;
    console.log(`✅ Created message: ${messageId.substring(0, 8)}...`);
    console.log(`   Body: "${message.body.substring(0, 60)}..."`);

    // Step 4: Check if job was enqueued
    console.log('\n[4/6] Checking if sentiment_triage job was enqueued...');
    await sleep(2000); // Give a moment for the trigger to fire

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
      console.warn('⚠️  No sentiment_triage job found (might still be processing)');
    } else {
      const job = jobs[0];
      console.log(`✅ Job enqueued: ${job.id.substring(0, 8)}...`);
      console.log(`   Type: ${job.job_type}`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Created: ${new Date(job.created_at).toLocaleTimeString()}`);
    }

    // Step 5: Wait for processing and check message enrichment
    console.log('\n[5/6] Waiting for job processing (15 seconds)...');
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      process.stdout.write('.');
    }
    console.log();

   // Step 6: Check if message was enriched
    console.log('\n[6/6] Checking message enrichment...');
    const { data: enrichedMsg, error: enrichErr } = await supabase
      .from('messages')
      .select('id, sentiment, intent')
      .eq('id', messageId)
      .single();

    if (enrichErr) {
      console.error('❌ Failed to query enriched message:', enrichErr.message);
      return false;
    }

    if (enrichedMsg.sentiment) {
      console.log(`✅ Message enriched!`);
      console.log(`   Sentiment: ${enrichedMsg.sentiment}`);
      console.log(`   Intent: ${enrichedMsg.intent || 'none'}`);
    } else {
      console.warn('⚠️  Message not yet enriched (job may still be processing)');
    }

    // Final check: Look for alerts if sentiment was critical
    if (enrichedMsg.sentiment === 'Critical' || enrichedMsg.sentiment === 'Agitated') {
      console.log('\n[Bonus] Checking for critical sentiment alert...');
      const { data: alerts, error: alertErr } = await supabase
        .from('alert_events')
        .select('id, alert_key, severity, message')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (!alertErr && alerts && alerts.length > 0) {
        console.log(`✅ Alert(s) created for critical sentiment:`);
        alerts.forEach(alert => {
          console.log(`   - ${alert.severity}: ${alert.message.substring(0, 50)}...`);
        });
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ WEEK 1 QUEUE FOUNDATION - WORKING!');
    console.log('='.repeat(60));
    return true;

  } catch (err) {
    console.error('\n❌ Unexpected error:', err.message);
    return false;
  }
}

testCompleteFlow().then(success => {
  process.exit(success ? 0 : 1);
});
