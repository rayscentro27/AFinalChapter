# NEXUS CRM RUNBOOK (Updated March 17, 2026)

## TABLE OF CONTENTS
1. [Known Issues & Error States](#known-issues)
2. [System Architecture](#system-architecture)
3. [Component Organization](#component-organization)
4. [Backend Migration Roadmap](#backend-migration-roadmap)
5. [Operational Procedures](#operational-procedures)
6. [Troubleshooting Guide](#troubleshooting-guide)

---

## KNOWN ISSUES & ERROR STATES

### 🔴 CRITICAL ERRORS

#### 1. **Edge Function Non-2xx Status Code (Multiple Modules)**
**Where it appears:**
- Workflow Detail page (when executing steps)
- Sales Trainer (workflow execution failures)
- Various workflow-engine calls

**Symptoms:**
```
Edge Function returned a non-2xx status code
Status: 403 Forbidden / 401 Unauthorized
```

**Root Cause:** Netlify Edge Functions or Supabase RLS policies rejecting requests
- Missing or expired auth tokens
- Tenant resolution failures in gateway
- RLS policy violations (user doesn't have access to tenant_id)

**Quick Fix:**
```bash
# Check Netlify function logs
netlify logs functions

# Check Supabase policy violations
SELECT * FROM public.sql_audit_log WHERE status = 'blocked' ORDER BY created_at DESC LIMIT 20;

# Verify tenant resolution in gateway
curl -X POST http://localhost:3000/admin/health \
  -H "Authorization: Bearer <token>" \
  -H "x-tenant-id: <uuid>"
```

**Status:** ⚠️ **In Progress - Requires Gateway & RLS Review**

---

#### 2. **Tier-Gating Module Access Blocks (SBA Prep, Funding Research, Funding Outcomes, Grants)**
**Where it appears:**
- SBA Prep page shows "PREMIUM Required"
- Funding Research shows "PREMIUM Required For Estimation"
- Grants Engine shows "Educational lessons only (upgrade for shortlist + drafts)"

**Symptoms:**
- Upgrade wall appears when it shouldn't
- Users see "Tier Gate: PREMIUM Required" modal
- Commission Disclosure missing flag (shown as "Missing")
- Agreement not accepted flag

**Root Cause (RESOLVED):** Missing `SBA_PREP` in `tierGateMap` - **FIXED in commit 5844587**
- But some users may still see cached upgrade walls
- Browser localStorage caching tier data

**Quick Fix:**
```javascript
// Clear local tier cache
localStorage.removeItem('userTierState');
localStorage.removeItem('subscriptionStatus');

// Verify from console
fetch('/.netlify/functions/admin-billing-tier?user_id=<uid>')
  .then(r => r.json())
  .then(console.log)
```

**Status:** ✅ **RESOLVED (Code Fix Complete - User Cache May Need Clear)**

---

#### 3. **AI Workforce Not Implemented**
**Where it appears:**
- Settings > AI Workforce tab

**Status Message:**
```
"Workflow management UI is not implemented yet. For now, use Neural Floor for agent operations."
```

**Root Cause:** UI stub exists but backend worker management not wired

**Workaround:** Use Neural Floor or direct agent configuration

**Status:** ⏳ **Backlog (Not Required for MVP)**

---

#### 4. **API Failures in DevTools Console**
**Visible Errors:**
```
POST https://goclearonline.cc/rest/v2/audit - 403 Forbidden
GET https://f23abc...jsondoc.com/... - 486 (Not Acceptable)
```

**Root Cause:**
- CORS misconfiguration for audit logging
- External service rate limiting

**Status:** ⚠️ **Non-blocking (Audit telemetry only)**

---

### 🟡 KNOWN LIMITATIONS

| Module | Limitation | Workaround | Priority |
|--------|-----------|-----------|----------|
| **Scenario Runner** | Must be backend worker - currently frontend blocking | Move runner to macmini queue | P1 |
| **Grants Catalog** | Catalog sourcing must be manual | Use import task bundles | P2 |
| **Commission Settlement** | Manual approval required on large payouts | Implement nightly settlement worker | P1 |
| **Contact Merge** | Merges single tenant only - multi-tenant not supported | Document workflow per tenant | P2 |
| **Sentiment Triage** | Only triggers on message ingestion, not retroactive | Re-ingest historical messages if needed | P3 |
| **Forensic Hub** | Cannot override risk scores manually | Create exception via API | P3 |

---

## SYSTEM ARCHITECTURE

### High-Level Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    NEXUS CRM FRONTEND                        │
│  (Next.js, React, Vite - goclearonline.cc)                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
┌────────────────┐     ┌──────────────────┐
│  SUPABASE      │     │   GATEWAY        │
│  - Auth        │     │  (Node.js)       │
│  - Database    │     │  - Webhooks      │
│  - RLS         │     │  - Routing       │
│  - Realtime    │     │  - Normalization │
└────────────────┘     └────────┬─────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
              ┌──────────────┐     ┌─────────────────┐
              │  TWILIO      │     │  META/WHATSAPP  │
              │  (SMS)       │     │  (Messages)     │
              └──────────────┘     └─────────────────┘
        
        ┌─────────────────────────────────────────┐
        │       MACMINI BACKEND WORKERS           │
        │  (Running async tasks/cron jobs)        │
        │  - Sentiment Triage Scanner             │
        │  - Sentinel Engine (Monitoring)         │
        │  - Scenario Runner (WIP)                │
        │  - Neural Scout (Batch Lead Processing)│
        │  - Content Factory (Template Generation)│
        │  - Commission Settlement (Nightly)      │
        │  - Merge Operations Queue               │
        └─────────────────────────────────────────┘
```

---

## COMPONENT ORGANIZATION

### Frontend Modules (User-Facing)

```
NEXUS CORE
├─ Dashboard (Overview, KPIs, pending tasks)
├─ SALES OPERATIONS
│  ├─ Pipeline Matrix (CRM Table)
│  ├─ Power Dialer (Phone Tool)
│  └─ Combat Coach (Sales Training Roleplay)
│
├─ LEAD GENERATION
│  ├─ Neural Scout (Intent Discovery)
│  └─ Lead Discovery Map (Geo-Intelligence)
│
├─ MESSAGING & NURTURING
│  ├─ Mobile Bridge (SMS/WhatsApp Management)
│  ├─ Content Factory (Campaigns & Sequences)
│  └─ Unified Inbox (All Messages)
│
├─ PORTFOLIO INTELLIGENCE
│  ├─ Risk Monitor / Sentinel Engine (Visualization)
│  ├─ Forensic Hub (Risk Analysis)
│  └─ Tier 2 Strategy (Wealth Alpha Coach)
│
├─ FUNDING & GRANTS
│  ├─ SBA Prep Module (Educational Workflow)
│  ├─ Funding Research Engine (Research & Ranking)
│  ├─ Funding Outcomes Tracker (Results Dashboard)
│  └─ Grants Engine (Matching & Applications)
│
├─ OPERATIONS
│  ├─ Channel Mapper (SMS/WhatsApp Channel to Contact Mapping)
│  ├─ Contact Merge (Deduplication UI)
│  ├─ Merge Queue View (Background Job Status)
│  ├─ On-Call Schedule (Staff Rotation)
│  └─ Compensation Dashboard (Commission View)
│
├─ TRAINING & KNOWLEDGE
│  ├─ Training Dashboard (Lesson Modules)
│  └─ Scenario Runner UI (Workflow Progress Display)
│
└─ ADMIN & SETTINGS
   ├─ Global Settings (API Keys, Configuration)
   ├─ Team Members Management
   ├─ Role-Based Access Control
   └─ Billing & Subscriptions
```

### Backend Services (macmini & Netlify)

```
NETLIFY EDGE FUNCTIONS (Real-time)
├─ agent.ts (AI Employee Router)
├─ admin-health.ts (System Health Checks)
├─ admin-monitoring-alerts.ts (Alert Delivery)
├─ admin-alerts-run.ts (Alert Evaluation)
├─ attachments-upload.ts (File Storage)
└─ outbox.ts (Message Send Proxy)

SUPABASE FUNCTIONS
├─ funnel-engine (Lead Capture → Enrollment)
├─ funnel-webhooks (Brevo, Stripe, WhatsApp Events)
├─ lead-capture (Landing Page Form Submission)
└─ workflow-engine (Multi-Step Workflow Execution)

MACMINI WORKERS (New - Under Migration)
├─ sentiment-triage-scanner (30-min intervals)
├─ sentinel-monitor (15-min health checks)
├─ neural-scout-batch (Daily lead discovery)
├─ content-factory-generator (Async template creation)
├─ scenario-runner-queue (Background execution)
├─ commission-settlement (Nightly 11pm)
└─ merge-operations-worker (Continuous queue processing)

GATEWAY SERVICES (oracle-gateway running on separate service)
├─ Webhook Routes (Twilio, Meta, WhatsApp)
├─ Routing Engine (Conversation → Agent Assignment)
├─ Inbox Management (Message Normalization)
└─ Channel Resolution (SMS/WhatsApp → Tenant Mapping)
```

---

## BACKEND MIGRATION ROADMAP

### Phase 1: NOW (March 2026)
- [x] Tier-gating patches applied & tested (5 fixes)
- [x] Sentiment triage detection logic verified
- [ ] Move sentiment triage to macmini cron (1-2 days)
- [ ] Deploy sentinel monitoring worker (1-2 days)

### Phase 2: Week of March 24
- [ ] Scenario runner migration to macmini queue (3-4 days)
- [ ] Commission settlement automation (2-3 days)
- [ ] Merge operations queue productionization (2 days)

### Phase 3: Week of March 31
- [ ] Neural scout batch jobs (2 days)
- [ ] Content factory async generation (2 days)
- [ ] Grants matching engine backend optimization (2 days)

### Phase 4: April (Post-MVP)
- [ ] Wealth alpha strategy computation on macmini
- [ ] Forensic hub batch risk rescoring
- [ ] Training knowledge extraction from transcripts

---

## OPERATIONAL PROCEDURES

### Starting the System

#### 1. **Local Development**
```bash
# Terminal 1: Supabase local dev
supabase start

# Terminal 2: Netlify functions local server
netlify dev --functions netlify/functions

# Terminal 3: Gateway (if modifying webhooks)
cd gateway && npm run dev

# Terminal 4: Frontend
npm run dev
```

#### 2. **Checking System Health**
```bash
# Check Supabase status
curl http://localhost:54321/health

# Check Netlify functions
curl http://localhost:8888/.netlify/functions/admin-health

# Check Gateway webhooks
curl http://localhost:3000/health

# Check auth (should return 200 with user profile)
curl http://localhost:8888/.netlify/functions/admin-monitoring-overview \
  -H "Authorization: Bearer $SUPABASE_JWT"
```

#### 3. **Testing Tier-Gating (Verify Fix)**
```bash
# Login as premium user
# Navigate to: SBA Prep, Funding Research, Funding Outcomes, Lender Room
# Expected: Page loads without upgrade wall

# Login as free user
# Navigate to same pages
# Expected: Upgrade wall appears with "PREMIUM tier required"

# Login as super_admin
# Navigate to same pages
# Expected: Page loads without upgrade wall (admin bypass active)
```

---

### Monitoring & Alerts

#### Key Metrics to Watch
```sql
-- Check alert state
SELECT alert_key, status, severity, occurrences, last_triggered_at 
FROM monitoring_alerts 
WHERE tenant_id = '<uuid>' AND status = 'open';

-- Check message enrichment failures
SELECT COUNT(*), ai_enrich_status, ai_last_error
FROM messages
WHERE tenant_id = '<uuid>' AND created_at > now() - interval '1 hour'
GROUP BY ai_enrich_status, ai_last_error;

-- Check workflow execution failures
SELECT COUNT(*), status, error_message
FROM workflow_executions
WHERE tenant_id = '<uuid>' AND created_at > now() - interval '1 hour'
GROUP BY status, error_message;
```

#### Common Alert Scenarios
| Alert | Cause | Resolution |
|-------|-------|-----------|
| `channels_down` | SMS/WhatsApp channel offline | Check Twilio/Meta API status, restart gateway |
| `webhook_failures_24h_spike` | High failed webhook events | Check event payload format, verify signatures |
| `queue_pending_high` | Message send queue backed up | Increase queue workers, check rate limits |
| `rls_policy_blocks` | Auth failures | Verify JWT, check tenant_id resolution |

---

### Deployment Checklist

#### Before Each Deploy to Production
- [ ] All tier-gating fixes pass manual test (super_admin, premium, free users)
- [ ] No console errors in browser DevTools (F12)
- [ ] Edge Function logs show no 403/401 errors (last 10 min)
- [ ] Supabase migrations are applied (check schema version)
- [ ] Gateway webhook routes are accessible (POST /webhooks/twilio, /webhooks/meta)
- [ ] Contact tier data is not stale (check `updated_at` timestamp)

#### Hotfix Process
If errors appear in production:
```bash
# 1. Check what changed
git log --oneline -5

# 2. Rollback if needed
git revert <commit-hash>
git push origin main

# 3. Check function logs
netlify logs functions --filter=error

# 4. Monitor for recovery
watch 'curl http://prod.api/health'
```

---

## TROUBLESHOOTING GUIDE

### Issue: "Upgrade Required" Wall Appears for Premium User

**Diagnosis:**
```javascript
// Open DevTools console and run:
localStorage.getItem('userTierState')
// Should show: {tier: 'PREMIUM', status: 'active'}
// If missing or wrong, cache is stale
```

**Solution:**
```javascript
// Clear cache
localStorage.removeItem('userTierState');
localStorage.removeItem('subscriptionStatus');
location.reload();

// Verify from API
fetch('/.netlify/functions/admin-billing-tier')
  .then(r => r.json())
  .then(d => console.table(d))
```

---

### Issue: "Edge Function returned a non-2xx status code"

**Diagnosis Steps:**
1. Check if JWT token is present: `Authorization: Bearer <token>`
2. Verify tenant_id is resolvable from token claims
3. Check RLS policy blocks in Supabase logs

**Solution:**
```bash
# Step 1: Verify auth
supabase_jwt=$(curl -s http://localhost:54321/auth/v1/token \
  -d "grant_type=password" \
  -d "email=test@example.com" \
  -d "password=password" \
  -H "Content-Type: application/json" \
  | jq -r '.access_token')

# Step 2: Test function with token
curl http://localhost:8888/.netlify/functions/admin-health \
  -H "Authorization: Bearer $supabase_jwt"

# Step 3: Check RLS blocks
psql $DATABASE_URL -c "SELECT * FROM public.sql_audit_log WHERE policy_violation = true LIMIT 5;"
```

---

### Issue: Workflow Execution Fails ("Non-deterministic Step Result")

**Root Cause:** Scenario runner trying to execute steps on frontend (blocking)

**Solution (Temporary):**
- Increase timeout in scenario-runner component
- View step results after completion (don't expect live updates)

**Solution (Permanent):**
- Deploy scenario-runner worker to macmini (roadmap phase 2)

---

### Issue: Contact Merge Hangs or Shows "Conflict Resolution"

**Diagnosis:**
```sql
-- Find stuck merge jobs
SELECT id, status, error_message, updated_at 
FROM contact_merges 
WHERE status = 'pending' 
ORDER BY updated_at DESC 
LIMIT 10;
```

**Solution:**
```sql
-- Manually resolve if needed
UPDATE contact_merges 
SET status = 'resolved', resolved_at = now() 
WHERE id = '<merge_id>' AND status IN ('pending', 'conflict');
```

---

### Issue: "Missing Commission Disclosure" Warning

**Diagnosis:**
```sql
SELECT commission_disclosure_accepted, created_at 
FROM users WHERE id = '<user_id>';
```

**Solution:**
```javascript
// User must navigate to:
// Settings > Communications > Accept Commission Disclosure
// OR admin can mark as accepted:
```

```sql
UPDATE users 
SET commission_disclosure_accepted = true, updated_at = now() 
WHERE id = '<user_id>';
```

---

## QUICK REFERENCE: ERROR CODES

| Code | Meaning | Action |
|------|---------|--------|
| `401` | Unauthorized (no JWT or expired) | Re-login |
| `403` | Forbidden (RLS policy block or insufficient role) | Check tenant access, verify role |
| `404` | Resource not found | Verify ID is correct |
| `429` | Rate limited | Wait 60s, then retry |
| `503` | Service unavailable | Check Supabase/Netlify status page |
| `E_ENRICH_FAILED` | AI enrichment failed | Check AI_PROVIDER env var, retry in 5min |
| `E_MERGE_CONFLICT` | Contact merge has conflicts | Manual review required in UI |

---

## SAFETY GUIDELINES

### DO NOT:
- ❌ Manually update `subscription_status` without corresponding `plan_code` change
- ❌ Bypass RLS policies for "testing" (they exist for data protection)
- ❌ Delete users who have funded deals (creates orphaned records)
- ❌ Force-delete contacts with pending merges (metadata will be lost)

### ALWAYS:
- ✅ Verify JWT token is present before API calls
- ✅ Test tier-gating changes with multi-role users (super_admin, premium, free, client)
- ✅ Check monitoring_alerts table after system changes
- ✅ Document any manual interventions in `activity_log` or tags

---

## SUPPORT CONTACTS

| System | Owner | Status Page |
|--------|-------|-------------|
| Supabase | Database & Auth | https://status.supabase.com |
| Netlify | Frontend Hosting & Functions | https://www.netlify.com/status/ |
| Twilio | SMS Provider | https://www.twilio.com/system-status |
| Meta | WhatsApp & Messaging | https://www.metastatus.com |
| macmini | Backend Workers | Internal (check gateway logs) |

---

**Last Updated:** March 17, 2026  
**Version:** 2.0 (Updated Architecture + Known Issues)  
**Next Review:** March 24, 2026 (End of Phase 1)
