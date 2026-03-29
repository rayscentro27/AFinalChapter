# NEXUS FLOW REPAIR MODE — PRODUCTION ANALYSIS

**Date:** March 17, 2026  
**Status:** FLOW AUDIT COMPLETE  
**Mode:** Systems Engineering / Production Orchestration

---

## EXECUTIVE SUMMARY

Your system has **all the building blocks** but **no automation layer**.

**Current State:**
```
✅ Frontend UI: Fully functional components
✅ Database: Complete Supabase schema
✅ Gateway: Oracle integration + monitoring + queue infrastructure
✅ Workers: Partial queue system + video worker scaffolding
❌ EVENT TRIGGERING: MISSING
❌ AUTO-EXECUTION: MISSING  
❌ JOB ORCHESTRATION: MISSING
```

**The Gap:**
- Features exist but require **manual UI clicks** to activate
- Backend workers exist but **no job handlers registered**
- Macmini workers exist but **not reading from queue**
- No system "always running" or triggering autonomously

**Result:**
👉 **System is like a factory with no conveyor belt.**

---

## 1. FLOW BREAKPOINTS - DETAILED AUDIT

### 1.1 SENTIMENT TRIAGE (Currently Semi-Manual)

**Current Location:** `services/automationEngine.ts`

**How It Works Now:**
```typescript
// Currently: Only runs when contact is updated via API
if (updated.messageHistory?.length) {
  const lastClientMsg = [...updated.messageHistory].reverse().find(m => m.sender === 'client');
  if (lastClientMsg) {
    const content = lastClientMsg.content.toLowerCase();
    const hasCritical = CRITICAL_KEYWORDS.some(k => content.includes(k));
    // ... sets sentiment = 'Critical' or 'Agitated'
  }
}
```

**Problem:**
- 🔴 Only triggers on explicit message update
- 🔴 No continuous message ingestion loop
- 🔴 Keywords are baked in (not ML-based)
- 🔴 Never rescans historical messages
- 🔴 UI component `SupervisorTriage.tsx` manually displays triage list

**What Should Happen:**
```
WHEN new_message arrives in database
  → trigger sentiment_triage_worker
  → analyze message with Gemini AI
  → tag contact with sentiment level
  → if Critical/Agitated → create alert
  → update UI automatically (via Supabase realtime)
```

**Responsibility Layer:** SHOULD BE macmini worker (not frontend)

**Owner:** macmini `sentiment-triage-worker`

---

### 1.2 SENTINEL ENGINE (Currently Manual Button Click)

**Current Location:** `gateway/src/routes/admin_monitoring.js` + `src/pages/AdminHealth.tsx`

**How It Works Now:**
```typescript
// In AdminHealth component
async function runAlertCheck() {
  const response = await fetch('/.netlify/functions/admin-alerts-run', {
    method: 'POST',
    body: JSON.stringify({ tenant_id: tenantId, notify: true }),
  });
}

// User clicks "Run Alert Check" button manually
// Function polls monitoring_alerts table
// Compares thresholds (channels down, queue depth, delivery failures)
// Opens/closes alerts
```

**Problem:**
- 🔴 Requires manual UI button click
- 🔴 Runs only when admin remembers to click
- 🔴 No scheduled/periodic execution
- 🔴 No proactive alerting
- 🔴 Can miss incidents between manual checks

**What Should Happen:**
```
EVERY 15 MINUTES (cron):
  → sentinel-monitor-worker runs
  → checks all alert thresholds
  → opens/closes alerts automatically
  → sends notifications if new alert or resolved
  → logs metrics to observability
```

**Responsibility Layer:** Backend cron trigger (Supabase or macmini cron)

**Owner:** macmini `sentinel-monitor-worker` + Supabase edge function cron

---

### 1.3 NEURAL SCOUT / LEAD DISCOVERY (Currently UI-Only)

**Current Location:** `components/LeadScout.tsx` + `services/geminiService.ts`

**How It Works Now:**
```typescript
const handleScout = async () => {
  const res = await geminiService.findHighIntentLeads(query);
  // Direct Gemini API call from React component
  // Blocks UI while waiting
  setLeads(enhancedLeads);
};
```

**Problem:**
- 🔴 Blocking UI call (no non-blocking pattern)
- 🔴 Only triggers on user search click
- 🔴 No background batch jobs
- 🔴 No scheduled daily rescoring
- 🔴 Gemini API called directly from frontend (expensive)

**What Should Happen:**
```
DAILY (cron):
  → neural-scout-batch-worker runs
  → pulls all "potential" leads
  → runs intent discovery on each
  → rescores and ranks by opportunity
  → updates lead.ai_intent_score in bulk
  → frontend displays updated ranking

USER TRIGGERS:
  → submit search query
  → enqueue neural_scout job
  → worker processes async
  → frontend polls for completion
  → display results non-blocking
```

**Responsibility Layer:** macmini batch worker (not frontend)

**Owner:** macmini `neural-scout-worker`

---

### 1.4 SCENARIO RUNNER (Currently Synchronous UI Blocking)

**Current Location:** `supabase/functions/workflow-engine/` + `src/pages/WorkflowDetailPage.tsx`

**How It Works Now:**
```typescript
async function markCurrentStepCompleteAndAdvance() {
  const response = await fetch(
    `/.netlify/functions/workflow-engine`,
    {
      body: JSON.stringify({ 
        action: 'advanceInstance',
        instance_id: instanceId,
      }),
    }
  );
  // Blocks UI until workflow step completes
  // Long-running steps timeout
}
```

**Problem:**
- 🔴 Awaits completion in UI (blocking)
- 🔴 Network/timeout errors break workflow
- 🔴 No persistent job queue
- 🔴 No retry/backoff logic
- 🔴 Multi-step workflows prone to failure

**What Should Happen:**
```
USER CLICKS "Advance":
  → enqueue scenario_run_job
  → return immediately to UI
  → show "Processing..."
  → UI polls for completion
  → when done → notify and advance display

Job Handler (macmini):
  → load scenario pack
  → run each step
  → handle failures with retry
  → persist results to scenario_run_items
  → update instance status
  → emit completion event → UI realtime update
```

**Responsibility Layer:** macmini async queue (not Netlify function)

**Owner:** macmini `scenario-runner-worker`

---

### 1.5 CONTENT FACTORY (Exists But Disabled)

**Current Location:** `opt/nexus-services/video-content-worker/worker.js`

**How It Works Now:**
- ✅ Worker scaffolding exists
- ❌ Disabled (not connected to queue)
- ❌ No UI trigger
- ❌ No scheduled jobs

**What Should Happen:**
```
TRIGGER 1 - MANUAL UI:
  → user clicks "Generate Content Pack"
  → enqueue video_content_generation job
  → worker processes async
  → drafts saved to research_artifacts
  → UI notified

TRIGGER 2 - NIGHTLY CRON:
  → video-content-worker runs
  → scans recent transcripts
  → auto-generates relevant content packs
  → stores as drafts for review
```

**Responsibility Layer:** macmini queue handler

**Owner:** Already scaffolded, just needs queue connection

---

### 1.6 GRANTS MATCHING ENGINE (Currently Static List)

**Current Location:** `components/GrantsEngine.tsx`

**How It Works Now:**
```typescript
// Component shows static grant catalog
// No automatic re-matching
// No scoring updates
// Manual UI-driven only
```

**Problem:**
- 🔴 Grants catalog static
- 🔴 No contact-to-grant matching job
- 🔴 No daily rescoring
- 🔴 No automated suggestions

**What Should Happen:**
```
DAILY (cron):
  → grants-matcher-worker runs
  → pulls all grants from catalog
  → pulls all contacts with funding needed
  → scores each contact against each grant
  → stores matches in contact.grant_opportunities
  → frontend displays "New Grant Match: XYZ" notifications
```

**Responsibility Layer:** macmini batch worker

**Owner:** New worker type needed

---

### 1.7 COMMISSION SETTLEMENT (Currently Manual Approval)

**Current Location:** `automationEngine.ts` (partial) + manual invoice review

**How It Works Now:**
```typescript
// Invoices created but not settled
// Requires manual approve/deny
// No automatic payout
```

**Problem:**
- 🔴 Manual UI approval required
- 🔴 No batch settlement process
- 🔴 No scheduled nightly runs
- 🔴 Invoices pile up

**What Should Happen:**
```
NIGHTLY 11:00 PM (cron):
  → commission-settler-worker runs
  → loads pending approved invoices
  → groups by recipient
  → calculates net settlement
  → creates payout record
  → logs to accounting system
  → updates invoice.status = 'settled'
  → notifies recipients (email/SMS)
```

**Responsibility Layer:** macmini nightly batch

**Owner:** New worker type needed

---

### 1.8 CONTACT DEDUPLICATION & MERGE QUEUE

**Current Location:** `components/ContactMerge.tsx` + `src/pages/AdminMergeJobs.tsx`

**How It Works Now:**
```typescript
// Manual UI to initiate merge
// Queue exists but never processed
// merge_queue table has rows sitting
// No background worker claims jobs
```

**Problem:**
- 🔴 Queue created but idle
- 🔴 No worker processes it
- 🔴 Merge jobs stuck in "pending"
- 🔴 UI blocked during merge

**What Should Happen:**
```
ALWAYS RUNNING (worker loop):
  → merge-operations-worker polls job_queue
  → claims pending merge jobs
  → atomically merges contacts
  → moves history/messages to target
  → redacts source contact
  → updates all references
  → marks complete
  → next job immediately claimed
```

**Responsibility Layer:** gateway queue or macmini worker (can be gateway-native)

**Owner:** `merge-executor-worker`

---

## 2. EVENT → WORKER MAPPING TABLE

### Gateway Triggers (Real-Time)

| Event | Current | Responsibility | Handler | Status |
|-------|---------|-----------------|---------|--------|
| `webhook.message.inbound` | Gateway routes | sentiment-triage-worker | `processInboundMessage` | ❌ Handler missing |
| `webhook.status.change` | Gateway logs | grants-matcher-worker | `retriggerMatching` | ❌ Handler missing |
| `api.contact.updated` | Service layer | Various | `automation.processAutomations` | 🟡 Partial (sync only) |
| `api.offer.accepted` | Service layer | commission-settler-worker | `trackOffersForSettlement` | ❌ Handler missing |

### Scheduled/Cron Triggers

| Event | Schedule | Worker | Handler | Status |
|-------|----------|--------|---------|--------|
| health_monitor | Every 15 min | sentinel-monitor | `runAlertChecks` | ❌ Manual UI only |
| lead_rescoring | Daily 6 AM | neural-scout-batch | `rescoreLeadsDaily` | ❌ Disabled |
| grants_refresh | Daily 8 AM | grants-matcher | `matchAllContactsToGrants` | ❌ Disabled |
| content_generation | Nightly 10 PM | video-content-worker | `generateNightlyPacks` | ❌ Disabled |
| commission_settlement | Nightly 11 PM | commission-settler | `settleApprovedInvoices` | ❌ Missing |
| merge_queue_process | Always (loop) | merge-executor | `processMergeQueue` | ❌ Missing |

### Manual Triggers (UI Buttons)

| Action | Current | Should Be |
|--------|---------|-----------|
| Generate scenario script | Blocking Netlify call | Enqueue + async poll |
| Scout for leads | Blocking Gemini call | Enqueue + async poll |
| Generate content | Not available | Enqueue + async poll |
| Run sentiment scan | Not available | Enqueue + async poll |
| Settlement review | Manual approval | Auto-settle + notify |

---

## 3. MACMINI WORKER ORCHESTRATION DESIGN

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    GATEWAY (Oracle)                 │
│  - Queue management (claim/process/complete)       │
│  - Webhook routing + enrichment                    │
│  - Admin API endpoints                              │
│  - Control plane (kill switches, scaling)          │
└──────────────────┬──────────────────────────────────┘
                   │
      ┌────────────┴────────────┐
      │                         │
      ▼                         ▼
┌──────────────┐         ┌──────────────┐
│   SUPABASE   │         │    MACMINI   │
│  Job Queue   │◄────────┤   Workers    │
│  (source of  │         │  (polling &  │
│   truth)     │         │   executing) │
└──────────────┘         └──────────────┘
```

### macmini Worker Loop Design (Pseudocode)

```javascript
async function workerLoop() {
  while (true) {
    // 1. Poll for available jobs (10-15 second interval)
    const jobs = await supabase
      .from('job_queue')
      .select('*')
      .eq('status', 'pending')
      .eq('available_at <= now()')
      .limit(WORKER_CONCURRENCY);
    
    // 2. For each job, claim it
    for (const job of jobs) {
      const leased = await claimJob(job.id, {
        worker_id: WORKER_ID,
        lease_expires_at: now + 5m
      });
      
      if (!leased) continue; // Lost to another worker
      
      // 3. Get job handler
      const handler = HANDLERS[job.job_type];
      if (!handler) {
        await markFailed(job.id, 'handler_not_found');
        continue;
      }
      
      // 4. Execute job
      try {
        const result = await handler(job.payload);
        await markCompleted(job.id, result);
      } catch (error) {
        if (isRetryable(error)) {
          await markRetry(job.id, error);
        } else {
          await markFailedPermanent(job.id, error);
        }
      }
    }
    
    // 5. Heartbeat status
    await sendHeartbeat({
      worker_id: WORKER_ID,
      status: 'running',
      jobs_processed: jobs.length,
      queue_depth: await getQueueDepth()
    });
    
    // 6. Sleep before next poll
    await sleep(10 + randomJitter(2));
  }
}
```

### Job Handlers (Pseudo-Implementation)

```javascript
const HANDLERS = {
  'sentiment_triage': async (payload) => {
    const message = await supabase
      .from('messages')
      .select('*')
      .eq('id', payload.message_id)
      .single();
    
    const enrichment = await gemini.classifyMessage(message.body);
    
    await applyMessageEnrichment(message.id, enrichment);
    
    if (enrichment.sentiment === 'Critical') {
      await createAlert({
        contact_id: message.contact_id,
        alert_type: 'sentiment_critical',
        body: enrichment.summary
      });
    }
    
    return { enriched: true, sentiment: enrichment.sentiment };
  },

  'neural_scout_batch': async (payload) => {
    const leads = await supabase
      .from('contacts')
      .select('*')
      .eq('status', 'Lead')
      .is('ai_intent_score', null);
    
    const results = [];
    for (const lead of leads) {
      const intent = await gemini.analyzeLeadIntent(lead);
      await supabase
        .from('contacts')
        .update({ ai_intent_score: intent.score })
        .eq('id', lead.id);
      results.push({ lead_id: lead.id, score: intent.score });
    }
    
    return { updated: results.length };
  },

  'grants_matcher': async (payload) => {
    const grants = await supabase.from('grant_catalog').select('*');
    const contacts = await supabase
      .from('contacts')
      .select('*')
      .eq('needs_funding', true);
    
    for (const contact of contacts) {
      const matches = grants.filter(g => 
        contact.state === g.state && 
        contact.industry === g.industry_code
      );
      
      await supabase
        .from('contact_grant_opportunities')
        .upsert({ contact_id: contact.id, grant_matches: matches });
    }
    
    return { matched_contacts: contacts.length };
  },

  'scenario_runner': async (payload) => {
    const pack = await supabase
      .from('scenario_packs')
      .select('*')
      .eq('id', payload.pack_id)
      .single();
    
    const run = await supabase
      .from('scenario_runs')
      .insert({
        pack_id: pack.id,
        status: 'running',
        started_at: now()
      })
      .select()
      .single();
    
    for (const scenario of pack.scenarios) {
      const result = await runScenarioWithAI(scenario);
      await supabase
        .from('scenario_run_items')
        .insert({
          run_id: run.id,
          scenario: scenario,
          result: result.output,
          passed: result.passed,
          score: result.score
        });
    }
    
    await supabase
      .from('scenario_runs')
      .update({ status: 'completed', completed_at: now() })
      .eq('id', run.id);
    
    return { run_id: run.id, scenarios_processed: pack.scenarios.length };
  },

  'merge_executor': async (payload) => {
    const merge = await supabase
      .from('contact_merges')
      .select('*')
      .eq('id', payload.merge_id)
      .single();
    
    await atomicallyMergeContacts(merge.from_id, merge.into_id);
    
    await supabase
      .from('contact_merges')
      .update({ status: 'completed', completed_at: now() })
      .eq('id', merge.id);
    
    return { merged: true };
  },
};
```

### Job Queue Table Schema (Already Exists)

```sql
create table if not exists job_queue (
  id uuid primary key,
  tenant_id uuid not null,
  job_type text not null,
  payload jsonb not null,
  status text not null default 'pending',
  worker_id text null,
  leased_at timestamptz null,
  lease_expires_at timestamptz null,
  started_at timestamptz null,
  completed_at timestamptz null,
  last_error text null,
  attempt_count int default 0,
  available_at timestamptz default now()
);
```

---

## 4. FRONTEND BUSINESS LOGIC → BACKEND MIGRATION

### Current Problems (UI Does Too Much)

| Component | Problem | Solution |
|-----------|---------|----------|
| `SalesTrainer.tsx` | Calls `await gemini.generateCoaching()` in render | Enqueue job, poll realtime |
| `LeadScout.tsx` | Calls `await gemini.findHighIntentLeads()` in click | Enqueue job, show spinner |
| `WorkflowDetailPage.tsx` | Awaits `advanceInstance()` (blocks UI) | Enqueue job, poll status |
| `ContactMerge.tsx` | Awaits merge completion | Enqueue job, background process |
| `SupervisorTriage.tsx` | Manually filters contacts in-memory | Let backend tag sentiment automatically |
| `RiskMonitor.tsx` | Generates alerts on demand | Backend generates alerts proactively |

### Architecture Fix Pattern

**Before (Blocking):**
```typescript
async handleScout() {
  const results = await gemini.findLeads(query); // BLOCKS
  this.setState({ leads: results });
}
```

**After (Non-Blocking + Job Queue):**
```typescript
async handleScout() {
  // 1. Enqueue job
  const job = await fetch('/.netlify/functions/enqueue-job', {
    body: JSON.stringify({
      job_type: 'neural_scout',
      payload: { query }
    })
  }).then(r => r.json());
  
  this.setState({ jobId: job.id, loading: true });
  
  // 2. Poll for completion (background)
  this.pollJobCompletion(job.id);
}

async pollJobCompletion(jobId, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const job = await supabase
      .from('job_queue')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (job.status === 'completed') {
      this.setState({ leads: job.result, loading: false });
      return;
    }
    
    if (job.status === 'failed') {
      this.setState({ error: job.last_error, loading: false });
      return;
    }
    
    await sleep(500); // Poll every 500ms
  }
  
  this.setState({ error: 'Job did not complete in time', loading: false });
}
```

---

## 5. FLOW INCONSISTENCIES TO FIX

| Inconsistency | Current | Fix |
|---|---|---|
| **Sentiment Storage** | In `contact.automationMetadata.sentiment` | Move to `messages.ai_sentiment` + `contact.sentiment_summary` (computed) |
| **Risk Scoring** | Computed in RiskMonitor component | Move to backend `riskProfileEngine.ts` + cache in `contact.risk_score` |
| **Grant Matching** | Manual list in UI | Auto-compute in backend + store in `contact_grant_opportunities` |
| **Merge Operations** | UI initiates, no tracking | Backend processes queue, UI monitors status |
| **Tier Gating** | Checked at component render | Consistent server-side validation (already done) |
| **Commission Logic** | Split between automationEngine + UI | Centralize in backend worker |

---

## 6. SYSTEM INTEGRATION REQUIREMENTS

### Supabase Requirements (Already Mostly In Place)

✅ Job Queue table exists  
✅ Monitoring alerts table exists  
✅ Worker heartbeats table exists  
✅ RLS policies in place  
⚠️ Realtime subscriptions for UI updates

### Gateway Requirements

✅ Queue claim/process/complete endpoints  
✅ Webhook routing  
❌ Job enqueue endpoint (simple HTTP post)  
❌ Control plane for worker scaling  
❌ Feature flag system for safe rollouts

### macmini Worker Requirements

✅ Polling loop exists in documentation  
❌ Persistent connection to Supabase  
❌ Job handlers registered  
❌ Gemini API integration  
❌ OpenClaw integration  
❌ Heartbeat reporting  
❌ Error logging to gateway

### UI Requirements  

✅ Components exist  
❌ Polling logic for job completion  
❌ Realtime Supabase subscriptions  
❌ Loading states for async operations  
❌ Error states with user messaging  

---

## 7. IMPLEMENTATION ROADMAP (4 Weeks)

### Week 1: Foundation (Queue Activation)
- [ ] Enable Gateway queue worker (`gateway/src/workers/queue_worker.js`)
- [ ] Register `noop` + `sentiment_triage` handlers
- [ ] Test job claim/process/complete cycle
- [ ] Create enqueue REST endpoint
- [ ] Dashboard showing queue depth

### Week 2: macmini Workers (Sentiment + Monitoring)
- [ ] Set up macmini polling loop
- [ ] Implement `sentiment_triage_worker` handler
- [ ] Implement `sentinel_monitor_worker` handler  
- [ ] Test end-to-end with real messages
- [ ] Set up cron triggers for monitor

### Week 3: Frontend Integration (Non-Blocking UI)
- [ ] Refactor SalesTrainer → job enqueue + poll
- [ ] Refactor LeadScout → job enqueue + poll
- [ ] Refactor WorkflowDetailPage → async workflow advance
- [ ] Add Supabase realtime for instant updates
- [ ] Test with concurrent users

### Week 4: Scale (Remaining Workers)
- [ ] Neural Scout batch worker + daily cron
- [ ] Grants Matcher worker + daily cron
- [ ] Merge Executor worker (continuous loop)
- [ ] Commission Settler nightly worker
- [ ] VideoContentWorker queue activation

---

## 8. SUCCESS CRITERIA FOR 100-USER SIMULATION

✅ **Automatic execution:** No manual button clicks required  
✅ **Queue stability:** Jobs claimed/completed within seconds  
✅ **Worker health:** No stale workers, automatic recovery  
✅ **Sentiment:** All new messages tagged within 30 seconds  
✅ **Alerts:** Health check runs every 15 min, instant alert notification  
✅ **Lead scoring:** Daily batch completes without UI blockage  
✅ **UI responsiveness:** No freezes during async operations  
✅ **Scalability:** System handles 10 macmini workers + gateway  
✅ **Data consistency:** No duplicate processing, no lost jobs  
✅ **Observability:** All jobs logged, metrics collected  

---

## NEXT STEPS

### **For You (Today):**

1. Review this analysis
2. Decide on Week 1 focus
3. Choose: Start with Gateway queue OR macmini workers first?

### **Technical Next Steps:**

**Option A: Gateway-First (Recommended for fast MVP)**
```bash
1. Modify gateway/src/workers/queue_worker.js 
2. Register handlers in handlers object
3. Create POST /.netlify/functions/enqueue-job endpoint
4. Test with curl: enqueue sentiment_triage job manually
```

**Option B: macmini-First (Better long-term)**
```bash
1. Set up macmini connection to Supabase
2. Implement polling loop (10-15s interval)
3. Create sentiment job handler
4. Test local before production
```

**Recommended:** Do both in parallel (Week 1 + 2 above).

---

**This is your production orchestration layer. Everything else is built. Now connect it.**

