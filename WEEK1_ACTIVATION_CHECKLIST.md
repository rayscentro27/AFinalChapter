# WEEK 1 ACTIVATION CHECKLIST — Queue Foundation

**Goal:** Get one job type working end-to-end (sentiment_triage)  
**Timeline:** 4-6 hours  
**Risk:** LOW (isolated, non-blocking changes)  

---

## PHASE 1: Enable Gateway Queue Worker (30 min)

### ✅ Step 1: Check Current State

```bash
# Verify queue worker exists
ls -la gateway/src/workers/queue_worker.js

# Check if it's in package.json scripts
grep "queue:worker" gateway/package.json
```

**Expected:** File exists, script defined.

### ✅ Step 2: Register Sentiment Handler

**File:** `gateway/src/workers/queue_worker.js`

Currently it has:
```javascript
const handlers = {
  noop: async (_job, { logger: jobLogger }) => {
    jobLogger.info({ event: 'job_noop_processed' }, 'job_noop_processed');
  },
};
```

**Change to:**
```javascript
const handlers = {
  noop: async (_job, { logger: jobLogger }) => {
    jobLogger.info({ event: 'job_noop_processed' }, 'job_noop_processed');
  },

  sentiment_triage: async (job, { logger: jobLogger }) => {
    const { supabaseAdmin } = await import('../supabase.js');
    const { enrichMessage, applyMessageEnrichment } = await import('../lib/ai/enrichMessage.js');
    
    const tenantId = String(job.tenant_id || '');
    const messageId = String(job.payload?.message_id || '');
    
    if (!tenantId || !messageId) {
      throw new Error('missing_tenant_id_or_message_id');
    }

    jobLogger.info({ job_id: job.id, message_id: messageId }, 'sentiment_triage_started');

    // Enrich message with AI
    const enrichment = await enrichMessage({
      supabaseAdmin,
      tenant_id: tenantId,
      message_id: messageId,
      includeSuggestedReply: true,
    });

    // Apply enrichment to message
    await applyMessageEnrichment({
      supabaseAdmin,
      tenant_id: tenantId,
      message_id: messageId,
      enrichment,
    });

    // If critical sentiment, create alert
    if (enrichment.sentiment === 'Agitated' || enrichment.sentiment === 'Negative') {
      const { openAlert } = await import('../lib/monitoring/metrics.js');
      await openAlert({
        tenant_id: tenantId,
        alert_key: `sentiment_${messageId}`,
        severity: enrichment.sentiment === 'Agitated' ? 'warn' : 'critical',
        message: `High friction sentiment detected in message: ${enrichment.summary}`,
        details: { message_id: messageId, sentiment: enrichment.sentiment },
      });
    }

    jobLogger.info({ job_id: job.id, message_id: messageId, sentiment: enrichment.sentiment }, 'sentiment_triage_completed');

    return { ok: true, sentiment: enrichment.sentiment };
  },
};
```

### ✅ Step 3: Start Gateway Worker

```bash
cd gateway
set -a; source .env; set +a

# Start in foreground (for debugging)
QUEUE_ENABLED=true npm run queue:worker

# Or in background
QUEUE_ENABLED=true npm run queue:worker &
# Save the PID: $!
```

**Expected Output:**
```
[2026-03-17T22:45:00] INFO: queue_worker_started
  - worker_id: gateway-worker-<pid>
  - queue_enabled: true
  - poll_seconds: 5
```

---

## PHASE 2: Create Job Enqueue Endpoint (30 min)

### ✅ Step 4: Create Netlify Function

**File:** `netlify/functions/enqueue-job.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async (req: any, context: any) => {
  if (req.method !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(req.body || '{}');
    const { job_type, payload, tenant_id } = body;

    if (!job_type || !payload || !tenant_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: job_type, payload, tenant_id' }),
      };
    }

    // Insert job into queue
    const { data, error } = await supabase
      .from('job_queue')
      .insert({
        tenant_id,
        job_type,
        payload,
        status: 'pending',
      })
      .select('id, job_type, status, created_at')
      .single();

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: `Job insert failed: ${error.message}` }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        job_id: data?.id,
        job_type,
        status: 'enqueued',
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(error) }),
    };
  }
};
```

### ✅ Step 5: Test Enqueue Endpoint

```bash
# In terminal
curl -X POST http://localhost:8888/.netlify/functions/enqueue-job \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "sentiment_triage",
    "tenant_id": "<your-tenant-uuid>",
    "payload": {
      "message_id": "<test-message-uuid>"
    }
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "job_id": "uuid-generated",
  "job_type": "sentiment_triage",
  "status": "enqueued"
}
```

---

## PHASE 3: Test End-to-End (1 hour)

### ✅ Step 6: Create Test Message

```sql
-- In Supabase SQL editor
INSERT INTO public.messages (
  tenant_id,
  conversation_id,
  contact_id,
  direction,
  sender,
  body,
  provider,
  external_message_id,
  ai_enrich_status
) VALUES (
  '<your-tenant-id>',
  '<create-or-use-existing-conv-id>',
  '<create-or-use-existing-contact-id>',
  'inbound',
  'contact',
  'This is terrible, I am very frustrated with this service!',
  'manual',
  'test_msg_' || gen_random_uuid()::text,
  'pending'
) RETURNING id;
```

Copy the returned `id`.

### ✅ Step 7: Enqueue Sentiment Job

```bash
curl -X POST http://localhost:8888/.netlify/functions/enqueue-job \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "sentiment_triage",
    "tenant_id": "<your-tenant-uuid>",
    "payload": {
      "message_id": "<message-id-from-step-6>"
    }
  }'
```

Copy the `job_id` from response.

### ✅ Step 8: Monitor Worker Logs

**Terminal with queue worker should show:**
```
[2026-03-17T22:50:15] INFO: job_started
  - job_id: <job-id>
  - job_type: sentiment_triage
  - worker_id: gateway-worker-<pid>

[2026-03-17T22:50:17] INFO: sentiment_triage_started
  - job_id: <job-id>
  - message_id: <message-id>

[2026-03-17T22:50:19] INFO: sentiment_triage_completed
  - sentiment: Agitated
```

### ✅ Step 9: Verify Job Completion

```sql
-- Check job status
SELECT id, job_type, status, started_at, completed_at, result
FROM public.job_queue
WHERE id = '<job-id-from-step-7>';

-- Check message enrichment
SELECT id, ai_sentiment, ai_summary, ai_urgency, ai_enrich_status
FROM public.messages
WHERE id = '<message-id-from-step-6>';

-- Check alert created (if sentiment was Critical/Agitated)
SELECT alert_key, status, severity, summary
FROM public.monitoring_alerts
WHERE tenant_id = '<your-tenant-id>'
  AND alert_key LIKE 'sentiment_%';
```

**Expected:**
- Job status: `completed`
- Message ai_sentiment: `negative` or `agitated`
- Message ai_enrich_status: `done`
- Alert created if sentiment was negative

---

## PHASE 4: Connect to Gateway Webhook (30 min)

### ✅ Step 10: Auto-Enqueue on Message Ingestion

**File:** `gateway/src/routes/inbox_message_routes.js` (or webhook handler)

Find where messages are ingested, add this:

```javascript
// After message is created/updated in Supabase:

if (message.ai_enrich_status === 'pending') {
  // Enqueue sentiment triage job
  const jobResult = await supabaseAdmin
    .from('job_queue')
    .insert({
      tenant_id: message.tenant_id,
      job_type: 'sentiment_triage',
      payload: {
        message_id: message.id,
        source: 'webhook_inbound'
      },
      status: 'pending',
    })
    .select('id')
    .single();

  if (!jobResult.error) {
    console.log(`[inbox] Enqueued sentiment_triage job: ${jobResult.data.id}`);
  }
}
```

### ✅ Step 11: Test Webhook Trigger

Send a test message via Twilio/WhatsApp webhook:

```bash
curl -X POST http://localhost:3000/webhooks/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'From=+1234567890&Body=This+service+is+awful&MessageSid=test_msg_123&To=+0987654321'
```

**Expected:**
- Message created in database
- Job automatically enqueued
- Worker picks it up in next poll (5-15 seconds)
- Sentiment tagged automatically

---

## VALIDATION CHECKLIST

- [ ] Gateway worker starts without errors
- [ ] Enqueue endpoint creates jobs in database
- [ ] Worker polls and claims jobs
- [ ] Sentiment handler executes successfully
- [ ] Message tagged with ai_sentiment
- [ ] Alerts created for critical sentiment
- [ ] Job transitions from pending → completed
- [ ] No UI blocking (worker runs in background)
- [ ] Logs show full job lifecycle

---

## TROUBLESHOOTING

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| Worker won't start | Check `QUEUE_ENABLED` env var | `export QUEUE_ENABLED=true` |
| Jobs not claimed | Worker not running | Run `npm run queue:worker` in gateway |
| Handler not found | Missing handler registration | Ensure named correctly in `handlers` object |
| Sentiment not updated | enrichMessage failing | Check AI_PROVIDER env var + API key |
| No alerts created | Threshold not hit | Test with "scam", "fraud", "angry" keywords |

---

## ROLLBACK PLAN

If something breaks:

```bash
# Stop queue worker
pkill -f "npm run queue:worker"

# Or gracefully:
kill <pid-from-step-3>

# Affected jobs will be re-claimed by worker when restarted
# No data loss - queue is persistent in Supabase
```

---

## NEXT (Week 2): macmini Workers

Once this works, immediately start:
1. Set up macmini polling loop
2. Implement `sentinel_monitor` handler
3. Set up cron trigger for monitoring

This is the assembly line going active. 🚀

