# NEXUS TWO-ENVIRONMENT ARCHITECTURE ANALYSIS
# Split-Runtime System: Production App + Mac Mini Workers
# Generated: March 18, 2026

## EXECUTIVE SUMMARY

Nexus CRM operates as a split-runtime system:

**Production Environment** (goclearonline.cc / app.goclearonline.cc):
- Netlify-hosted frontend
- Fastify gateway with Oracle integration
- Admin UI, client portal, CRM interface
- Job creation triggers
- Result display & monitoring
- Currently: manually starting queue worker (incorrect placement)

**Mac Mini Worker Environment** (backend execution):
- Long-running AI workers
- OpenClaw + ChatGPT login automation
- Browser/Comet workflows
- Async processing (research, enrichment, scenario execution)
- Queue polling from Supabase
- Result write-back to shared database

**Shared Brain** (Supabase):
- Queue tables (job_queue, job_queue_results)
- Data tables (messages, conversations, contacts, opportunities)
- Worker heartbeats & session health
- Event audit trail
- Control plane state

Currently **MISALIGNED**: queue:worker running in production gateway (Windows AFinalChapter) instead of on Mac Mini. This is Week 1 validation only—needs repositioning for production.

---

## ENVIRONMENT BREAKDOWN

### Environment A: Production App (goclearonline.cc)

**Current Ownership:**
- [frontend: React/TypeScript]
  - Dashboard, client portal, admin UI
  - Form entry, data display
  - Workflow visualization
  
- [gateway: Fastify]
  - Netlify function wrapper (external)
  - Webhook endpoints
  - Oracle sync
  - API access control
  - **Currently also**: queue:worker (WRONG — should move to Mac Mini)
  
- [lib/services]
  - workflowEngineApi (now has auth)
  - business rules
  - client-side enrichment (limited)

**Should Stay (Responsibility):**
- User authentication & session
- CRM data entry and updates
- Job creation & queueing
- Result consumption & display
- System health dashboard
- Integration status truth
- Route protection & RBAC
- Webhook handling (Twilio, Meta, etc.)

**Should Move to Mac Mini:**
- sentiment_triage execution ✓ (queue infrastructure ready)
- neural_scout batch analysis
- scenario runner execution
- content generation
- wealth strategy analysis
- grants/opportunity matching
- recurring scans & monitoring
- long-running browser workflows

**Currently Broken/Misaligned:**
- Queue worker starts in production (should auto-start, or deploy to Mac Mini)
- No heartbeat/worker health tracking
- No clear job result retrieval in UI
- No worker session monitoring
- Sentiment results stored but not displayed in conversations

---

### Environment B: Mac Mini Worker

**Current Status:** EMPTY / NOT YET IMPLEMENTED

**Should Own:**
- Queue polling loop
- Job execution framework
- OpenClaw session management
- ChatGPT login automation
- Browser/Comet workflows
- Async research execution
- Result writing back to Supabase
- Worker heartbeat emission
- Session health monitoring
- Recurring job scheduling

**Job Types (Priority Order):**

1. **sentiment_triage** ✓ (Proof of concept complete)
   - Input: message_id, conversation_id
   - Process: AI enrichment, classify sentiment/intent
   - Output: ai_sentiment, ai_intent, ai_urgency to messages table
   - Trigger: inbound message creation
   - Runtime: 2-5 seconds

2. **neural_scout_batch** (Daily / on-demand)
   - Input: tenant_id, contact_list
   - Process: research opportunities, enrich profiles
   - Output: opportunity records, contact enrichment
   - Trigger: scheduled cron or manual
   - Runtime: 5-30 minutes per batch

3. **scenario_runner** (On-demand)
   - Input: scenario_id, parameters
   - Process: ChatGPT sales roleplay, strategy execution
   - Output: scenario results, recommendations
   - Runtime: 5-15 minutes

4. **content_factory** (Async)
   - Input: content_type, template, data
   - Process: Generate proposals, emails, templates
   - Output: content artifacts
   - Runtime: 1-5 minutes

5. **grants_matcher** (Daily / on-demand)
   - Input: company profile, funding needs
   - Process: Research grants, match opportunities
   - Output: grant opportunity list
   - Runtime: 10-20 minutes

6. **sentiment_scan_recurring** (Daily)
   - Input: tenant_id
   - Process: Batch enrich pending messages
   - Output: enriched message records
   - Runtime: 5-30 minutes

---

## RESPONSIBILITY MAP BY ENVIRONMENT

| Feature/Module | Production App | Mac Mini Worker | Supabase |
|---|---|---|---|
| **User Login** | ✓ (handle) | — | store sessions |
| **CRM Data Entry** | ✓ (form UI) | — | store data |
| **Message Inbound** | ✓ (webhook receive) | — | initial insert |
| **Sentiment Triage** | create job | ✓ (execute) | store result |
| **Contact Display** | ✓ (show) | — | read data |
| **Enrichment Flags** | ✓ (display) | write AI results | store fields |
| **Neural Scout** | trigger/display | ✓ (research) | coord table |
| **Scenario Execution** | ✓ (user request) | ✓ (run workflow) | store results |
| **Content Gen** | ✓ (request) | ✓ (generate) | display |
| **Grants Matching** | ✓ (show matches) | ✓ (research) | store oppty |
| **Monitoring** | ✓ (display health) | emit heartbeat | store metrics |
| **Admin Controls** | ✓ (UI) | execute commands | audit log |

---

## EVENT-DRIVEN TRIGGER MAP

```
WHEN X HAPPENS → PRODUCTION DOES Y → MAC MINI DOES Z → RESULT STORED IN SUPABASE
```

### Inbound Message Flow
```
message_inbound_via_twilio
  ├─ Production: receive webhook
  ├─ Production: store in messages table (direction='in')
  ├─ Production: create job_queue record (type='sentiment_triage')
  ├─ Mac Mini: poll job_queue (every 5 seconds)
  ├─ Mac Mini: claim job, run enrichMessage()
  ├─ Mac Mini: update messages.ai_sentiment, ai_intent, ai_enriched_at
  ├─ Mac Mini: emit job_finished event
  └─ Production: refresh conversation view, show sentiment badge
```

### New Contact Flow
```
contact_created_in_crm
  ├─ Production: store contact record
  ├─ Production: optionally create neural_scout_batch job
  ├─ Mac Mini: claim job, run research (OpenClaw)
  ├─ Mac Mini: return enrichment fields, dedupe matches
  ├─ Mac Mini: update contacts table with results
  └─ Production: display enrichment alerts
```

### Scenario Requested
```
user_clicks_run_scenario
  ├─ Production: capture parameters, create scenario_job
  ├─ Production: show "processing..." UI
  ├─ Mac Mini: poll, claim job
  ├─ Mac Mini: execute ChatGPT workflow (30min)
  ├─ Mac Mini: store results in scenario_results table
  ├─ Mac Mini: emit completion event
  ├─ Production: poll for completion or webhook callback
  └─ Production: display results, recommendations
```

### Daily Sentiment Batch
```
cron_trigger_0600_UTC
  ├─ Production: (optional) verify cron token
  ├─ Production: create sentiment_scan_recurring job
  ├─ Mac Mini: claim job at scheduled time
  ├─ Mac Mini: batch process all 'pending' enrichments (may take 30min)
  ├─ Mac Mini: update all processed messages
  └─ Production: display dashboard update
```

### Grants Matching
```
grants_matching_requested
  ├─ Production: create grants_matcher job (user or cron)
  ├─ Mac Mini: claim job
  ├─ Mac Mini: research opportunities (OpenClaw, 15min)
  ├─ Mac Mini: insert opportunity records for this company
  ├─ Mac Mini: emit completion
  └─ Production: show matched opportunities in UI
```

---

## MAC MINI WORKER ORCHESTRATION

### Worker Architecture

**Entrypoint**: `mac-mini-worker.js` (runs continuously on Mac Mini)

```javascript
// Pseudocode
const WorkerPool = {
  workers: [
    { id: 'worker-1', type: 'universal', max_concurrent: 2, status: 'idle' },
    { id: 'worker-2', type: 'browser', max_concurrent: 1, status: 'idle' }
  ],
  
  async start() {
    await this.initSupabase();
    await this.initOpenClaw();
    await this.initHeartbeatEmitter();
    
    while (true) {
      await this.pollAndClaim();
      await sleep(5000);
    }
  },
  
  async pollAndClaim() {
    for (const worker of this.workers) {
      if (worker.concurrent < worker.max_concurrent) {
        const job = await this.claimNextJob(worker.type);
        if (job) {
          this.executeJobAsync(worker, job);
        }
      }
    }
  },
  
  async executeJobAsync(worker, job) {
    worker.concurrent += 1;
    try {
      const handler = handlers[job.job_type];
      const result = await handler(job, { logger, openclaw, worker_id: worker.id });
      await this.markJobComplete(job.id, result);
    } catch (err) {
      await this.scheduleRetry(job, err);
    } finally {
      worker.concurrent -= 1;
    }
  }
};
```

### Job Handler Types

```javascript
handlers = {
  sentiment_triage: async (job, ctx) => {
    // Already implemented ✓
    const { supabaseAdmin } = await import('../db');
    const enrichment = await enrichMessage({ tenant_id: job.tenant_id, message_id: job.payload.message_id });
    await applyMessageEnrichment(job.tenant_id, job.payload.message_id, enrichment);
    return { sentiment: enrichment.sentiment, intent: enrichment.intent };
  },
  
  neural_scout_batch: async (job, ctx) => {
    // Research batch
    const { openclaw, logger } = ctx;
    const contacts = await fetchPendingContacts(job.tenant_id);
    const results = [];
    
    for (const contact of contacts) {
      const research = await openclaw.researchCompany({ name: contact.company_name, ... });
      results.push({ contact_id: contact.id, research_data: research });
      await storeEnrichment(contact.id, research);
    }
    
    return { processed: results.length, status: 'complete' };
  },
  
  scenario_runner: async (job, ctx) => {
    // ChatGPT roleplay workflow
    const { openclaw } = ctx;
    const scenario = await fetchScenario(job.payload.scenario_id);
    const contact = await fetchContact(job.payload.contact_id);
    
    const session = await openclaw.startChatGPTSession({ user_email: SYSTEM_EMAIL });
    const result = await session.runScenario(scenario, contact);
    
    await storeScenarioResult(job.id, result);
    return { status: 'complete', result_id: result.id };
  },
  
  grants_matcher: async (job, ctx) => {
    // Research opportunities
    const { openclaw } = ctx;
    const company = await fetchCompany(job.payload.company_id);
    
    const opportunities = await openclaw.searchGrants({ 
      company_name: company.name,
      revenue: company.annual_revenue,
      industry: company.industry
    });
    
    await storeOpportunities(job.payload.company_id, opportunities);
    return { found: opportunities.length };
  },
  
  content_factory: async (job, ctx) => {
    // Generate content
    const template = job.payload.template;
    const data = job.payload.data;
    
    const generated = await generateContent({ template, data, ai_provider: 'chatgpt' });
    await storeContentArtifact(job.id, generated);
    return { content_id: generated.id };
  }
};
```

### Queue Table Structure

```sql
-- Job Queue (created from production)
CREATE TABLE job_queue (
  id uuid primary key,
  tenant_id uuid not null,
  job_type text not null,  -- sentiment_triage, neural_scout_batch, scenario_runner, ...
  payload jsonb,
  status text,             -- pending, claimed, processing, complete, failed
  created_at timestamptz,
  available_at timestamptz,     -- when ready to claim again
  lease_expires_at timestamptz, -- if worker dies, requeue after this
  attempt_count int default 0,
  max_attempts int default 5,
  error text
);

-- Job Results (Mac Mini writes completion here)
CREATE TABLE job_results (
  id uuid primary key,
  job_id uuid references job_queue(id),
  tenant_id uuid not null,
  job_type text,
  status text,     -- complete, failed, timeout
  result jsonb,
  error text,
  completed_at timestamptz,
  worker_id text,  -- which worker executed this
  execution_time_ms int
);

-- Worker Health (Mac Mini emits periodically)
CREATE TABLE worker_heartbeats (
  id uuid primary key,
  worker_id text not null,
  status text,           -- idle, processing, error
  current_job_id uuid,
  current_job_type text,
  concurrent_jobs int,
  memory_usage_mb int,
  emitted_at timestamptz
);

-- Scheduled Jobs (for recurring tasks)
CREATE TABLE scheduled_jobs (
  id uuid primary key,
  tenant_id uuid,
  job_type text,
  schedule_cron text,    -- "0 6 * * *" = 6am daily
  payload jsonb,
  last_run timestamptz,
  next_run timestamptz,
  is_active boolean,
  created_at timestamptz
);
```

### Retry & Failure Handling

```javascript
// After job fails:
// 1. Log error to job_results table with status='failed'
// 2. Increment attempt_count
// 3. If attempt_count < max_attempts:
//    - Calculate backoff delay (exponential)
//    - Set available_at = now() + delay
//    - Keep status = 'pending' (will be re-claimed)
// 4. If attempt_count >= max_attempts:
//    - Set status = 'failed' permanently
//    - Emit alert to admin dashboard
```

---

## PRODUCTION APP FLOW CLEANUP

### What to Fix

1. **Remove embedded async execution** from gateway
   - `queue:worker` should NOT be in production gateway
   - Move `src/workers/queue_worker.js` ownership to Mac Mini
   - Gateway should only create jobs, not execute them

2. **Fix workflow engine blocking** (already done with ensureAuth)
   - ✓ Added auth validation
   - Still need: add timeout protection to long-running calls

3. **Add result polling to frontend**
   - When user triggers async job (scenario runner, etc.), show modal
   - Poll `job_results` table every 500ms until completion
   - Display results, dismiss modal

4. **Add worker health display to admin dashboard**
   - Query `worker_heartbeats` table
   - Show active worker count, job load, memory usage
   - Alert if no heartbeats in last 2 minutes

5. **Convert "in-browser" features to job-based**
   - Scenario execution: create job, wait for results
   - Batch enrichment: trigger job, display progress
   - Research: create neural_scout_batch, display results

### Routes to Audit

```
GET    /admin/health          → add worker_heartbeats display
POST   /triggers/sentiment    → create sentiment_triage job (NOT execute)
POST   /triggers/scenario     → create scenario_runner job
POST   /admin/ai/enrich/run   → create sentiment_scan_recurring job
GET    /job/:id/result        → poll job_results table
POST   /grants/match          → create grants_matcher job
```

### New Routes Needed

```
GET    /workers/health        → fetch worker_heartbeats, status
GET    /jobs/:job_id/status   → fetch job_queue + job_results
POST   /jobs/:job_id/cancel   → mark job as cancelled
GET    /admin/worker-logs     → display worker execution logs
```

---

## SHARED SUPABASE COORDINATION MODEL

### Data Flow Diagram

```
Production App                 Supabase                  Mac Mini Worker
─────────────────              ────────                  ──────────────

User Input                      
  ├─ form submission    ──→    messages table
  ├─ scenario request   ──→    job_queue (type=scenario_runner)
  ├─ refresh UI         ←──    job_results
  │                            
Job Creation                    
  ├─ create_job()       ──→    job_queue (status=pending)
  │                            
                               Poll (every 5s)
                               ←─────────────    query job_queue WHERE status='pending'
                                                 lock strategy: UPDATE available_at
                                                 claim & start execution
                                                 
Worker Execution              
                               update job_queue
                               (status=processing, lease_expires_at)
                               ←─────────────    
                               
Result Write-back             
                               insert job_results ← write completed job data
                               update messages   ← write enrichment fields
                               update contacts   ← write research data
                               ←─────────────
                               
Heartbeat Emission            
                               insert worker_heartbeats ← periodically emit status
                               every 30 seconds         ←─

Result Display                
Display              ←─────────    query job_results, messages, contacts
receives fresh       
data via
subscription
or polling
```

### Write Ownership

| Table | Written By | Read By | On What Event |
|---|---|---|---|
| messages | Production (webhook) | Mac Mini (sentiment_triage) | inbound message |
| messages | Mac Mini (sentiment result) | Production (UI) | job complete |
| contacts | Production (CRM UI) | Mac Mini (research) | new contact |
| contacts | Mac Mini (enrichment) | Production (display) | research complete |
| job_queue | Production (create job) | Mac Mini (claim) | trigger event |
| job_results | Mac Mini (execution complete) | Production (display) | job done |
| worker_heartbeats | Mac Mini (periodic emit) | Production (admin dashboard) | every 30s |
| opportunities | Mac Mini (grants research) | Production (display) | research complete |

---

## FLOW ISSUES TO FIX

| Issue | Current State | Problem | Fix |
|---|---|---|---|
| Queue Worker Placement | Running in Windows AFinalChapter (production?) | Should be on Mac Mini, not in production | Move to Mac Mini workspace, add auto-start, heartbeat |
| Sentiment Results Hidden | Stored in DB but not shown in UI | User can't see enrichment | Add sentiment badge to conversation view |
| No Job Result Display | Jobs execute but no UI shows results | User doesn't know jobs completed | Add polling component for job results |
| No Worker Health | No heartbeat tracking | Can't tell if workers alive | Implement heartbeat emission + admin dashboard |
| Blocking Enrichment | Netlify function tries enrichment inline | Timeout, slow UX | Move to async job + result callback |
| Manual Job Trigger | Admin manually calls API to run enrichment | Should be automatic or scheduled | Implement cron scheduler on Mac Mini |
| No Retry Display | Failed jobs retry silently | User doesn't see retry status | Add job status polling with retry indicator |
| Stale Monitoring | No health checks visible | Can't detect worker pool issues | Add worker_heartbeats dashboard view |

---

## REQUIRED CODE CHANGES BY ENVIRONMENT

### Production App (Current AFinalChapter)

**Files to Modify:**
1. `netlify/functions/enqueue-job.ts` → Add job_type validation
2. `gateway/src/routes/platform_maturity.js` → Remove queue:worker ownership, change to job creation only
3. `components/ConversationView.tsx` → Add sentiment display badge
4. `components/AdminDashboard.tsx` → Add worker health panel
5. `services/jobPollingService.ts` (NEW) → Create polling for job results
6. `hooks/useJobStatus.ts` (NEW) → React hook for job polling

**Changes:**
- ✓ Auth validation (done)
- [ ] Remove sentiment_triage inline execution
- [ ] Add result polling component
- [ ] Add worker health dashboard
- [ ] Implement timeout on Gemini calls
- [ ] Create job status display modal
- [ ] Add recurring job scheduler UI

### Mac Mini (NEW WORKSPACE)

**Files to Create:**
1. `mac-mini-worker.ts` → Main worker loop
2. `workers/index.ts` → Handler registry
3. `workers/sentiment_triage.ts` (migrate from gateway)
4. `workers/neural_scout.ts` → Research worker
5. `workers/scenario_runner.ts` → ChatGPT workflow
6. `workers/grants_matcher.ts` → Opportunity research
7. `workers/content_factory.ts` → Content generation
8. `lib/openclaw.ts` → OpenClaw session manager
9. `lib/heartbeat.ts` → Worker heartbeat emitter
10. `lib/job-queue-client.ts` → Supabase queue operations

**Structure:**
```
mac-mini-worker/
├─ src/
│  ├─ mac-mini-worker.ts    (main entry)
│  ├─ workers/
│  │  ├─ index.ts
│  │  ├─ sentiment_triage.ts
│  │  ├─ neural_scout.ts
│  │  ├─ scenario_runner.ts
│  │  ├─ grants_matcher.ts
│  │  └─ content_factory.ts
│  ├─ lib/
│  │  ├─ openclaw.ts
│  │  ├─ heartbeat.ts
│  │  ├─ job-queue-client.ts
│  │  ├─ supabase.ts
│  │  └─ logger.ts
│  └─ services/
│     ├─ openai.ts
│     ├─ openrouter.ts
│     └─ chatgpt-automation.ts
├─ package.json
└─ README.md (worker setup guide)
```

---

## MINIMAL SQL ADDITIONS

```sql
-- Already have (from existing migrations):
-- - job_queue
-- - messages (with ai_* fields)
-- - contacts

-- Add if missing:

CREATE TABLE IF NOT EXISTS job_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references job_queue(id) on delete cascade,
  tenant_id uuid not null,
  job_type text,
  status text,
  result jsonb,
  error text,
  completed_at timestamptz default now(),
  worker_id text,
  execution_time_ms int,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null,
  status text,
  current_job_id uuid,
  current_job_type text,
  concurrent_jobs int,
  memory_usage_mb int,
  emitted_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS job_results_job_id_idx on job_results(job_id);
CREATE INDEX IF NOT EXISTS job_results_tenant_id_idx on job_results(tenant_id);
CREATE INDEX IF NOT EXISTS worker_heartbeats_worker_id_idx on worker_heartbeats(worker_id);
CREATE INDEX IF NOT EXISTS worker_heartbeats_emitted_idx on worker_heartbeats(emitted_at desc);
```

---

## IMPLEMENTATION ROADMAP

### Phase 1: Prove Mac Mini Worker Feasibility (This Week)
- [ ] Set up Mac Mini workspace clone
- [ ] Implement sentiment_triage worker (migrate from gateway)
- [ ] Test polling loop, heartbeat emission
- [ ] Validate result write-back to Supabase
- [ ] Success: sentiment_triage running on Mac Mini, results in UI

### Phase 2: Expand Worker Types (Next Week)
- [ ] Implement neural_scout_batch worker
- [ ] Implement scenario_runner with ChatGPT
- [ ] Implement grants_matcher
- [ ] Add retry logic, error handling
- [ ] Add worker health dashboard to production app

### Phase 3: Production Alignment (Week After)
- [ ] Remove queue:worker from production gateway
- [ ] Update all job creation routes
- [ ] Add result polling to frontend
- [ ] Add sentiment display to conversations
- [ ] Implement recurring job scheduling
- [ ] Test 10-user scenario

### Phase 4: Scale & Monitoring (Final Week)
- [ ] Add concurrent job support per worker
- [ ] Implement graceful shutdowns
- [ ] Add comprehensive logging
- [ ] Set up monitoring alerts
- [ ] Deploy to production

---

## TEST PLAN

### Unit Tests
- [ ] Job handler logic (sentiment_triage, neural_scout, etc.)
- [ ] Retry backoff calculations
- [ ] Heartbeat emission format
- [ ] Result write-back format

### Integration Tests
- [ ] Create job in production, verify Mac Mini claims it
- [ ] Execute job, verify result in database
- [ ] Verify result appears in production UI in <500ms
- [ ] Test worker failure + retry flow
- [ ] Test concurrent job handling

### End-to-End Tests
- [ ] Manual worker bring-up: start worker, verify heartbeat in admin
- [ ] Real messaging flow: send SMS, see enriched sentiment in 10 seconds
- [ ] Scenario execution: click "run scenario", wait 10 min, see results
- [ ] Grants matching: click "find grants", wait 5 min, see opportunities
- [ ] Multi-worker: 2 workers claiming jobs concurrently

### Load Tests
- [ ] 10 messages inbound simultaneously → all enriched, no queuing issues
- [ ] 100 pending sentiments → process within 5 minutes
- [ ] Worker failure mid-job → auto-retry, no data loss
- [ ] Network blip → worker reconnects, continues

### User Acceptance
- [ ] 10-user pilot: all jobs complete successfully, results display correctly
- [ ] 100-user simulation: sustainable worker load, no backlog
- [ ] Edge cases: network failures, worker crashes, stale sessions

---

## SUCCESS CRITERIA

✅ System should:
- [ ] Let production app trigger jobs via simple API call
- [ ] Let Mac Mini workers execute jobs independently, scale to 5+ concurrent
- [ ] Store all results in Supabase with full audit trail
- [ ] Display worker health in admin dashboard (real-time)
- [ ] Show job results in UI within 500ms of completion
- [ ] Retry failed jobs automatically with exponential backoff
- [ ] Remain <$50/month operational cost (no expensive APIs)
- [ ] Support manual + scheduled + event-driven job triggers
- [ ] Keep both environments in sync via Supabase only
- [ ] Prove 10-user pilot scenario end-to-end in <2 weeks

