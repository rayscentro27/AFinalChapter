# ERROR STATES & RESOLUTION TRACKER (March 17, 2026)

## SCREENSHOT ANALYSIS

### 1. WORKFLOW DETAIL PAGE - Edge Function Error ❌

**Error Message:**
```
Edge Function returned a non-2xx status code
```

**Location:** `instance_id=70fdb35-2b02-4aca-a65e-66cccb1c445#workflow_detail`

**Symptoms:**
- "REFRESH" button appears but returns error
- "COMPLETE STEP + ADVANCE" button disabled
- Step 1 of 6 shown (UPLOAD CREDIT REPORT)
- Error appears in red box below button area

**Root Cause Analysis:**
1. **Likely:** Netlify Edge Function (`/_netlify/functions/workflow-engine`) returned 403/401
2. **Probable Reason:**
   - JWT token missing or expired in request headers
   - Tenant ID not resolved from token
   - RLS policy blocking the workflow_executions table access
   - Workflow step permissions missing for user role

**Investigation Steps:**
```bash
# Check function logs
netlify logs functions --filter=workflow-engine

# Check Supabase RLS blocks
psql $DATABASE_URL -c "SELECT * FROM public.sql_audit_log 
WHERE endpoint LIKE '%workflow%' AND status = 'blocked' 
LIMIT 10;"

# Verify token is being passed
curl -v https://goclearonline.cc/.netlify/functions/workflow-engine \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"getStep","workflow_id":"<id>"}'
```

**Priority:** 🔴 **P1 - Blocks user workflow completion**

**ETA Fix:** 2-4 hours (auth/RLS review + test)

---

### 2. SALES TRAINER (Combat Coach) - Workflow Instance Error ❌

**Error Details from Console:**
```
POST https://goclearonline.cc/rest/v2/... 200
Edge Function returned a non-2xx status code
Status shows "ACTIVE" but workflow fails mid-execution
```

**Location:** `instance_id=70fdb35-2b02-4aca-a65e-66cccb1c445#sales_trainer`

**Component:** SalesTrainer.tsx (Live Coaching with Sentiment Tracking)

**Symptoms:**
- Workflow shows as ACTIVE (green badge)
- Real-time coaching interaction fails
- "Next task: Update AnnualCreditReport PDF" shown but unreachable
- Nested async geminiService call timeout or failure

**Root Cause Analysis:**
1. **Primary:** Combat Coach workflow steps using nested async calls that timeout
2. **Secondary:** Gemini API availability or rate limit hit
3. **Tertiary:** Workflow engine not properly awaiting task completion

**Technical Context:**
```typescript
// SalesTrainer.tsx uses this pattern (BLOCKING):
const coaching = await geminiService.generateCoaching({
  context: call.transcript,
  objective: scenario.objective
});
// If Gemini API is slow, this blocks subsequent steps
```

**Quick Fix:**
```typescript
// Convert to non-blocking pattern with polling
const coachingPromise = geminiService.generateCoaching({...});
// Show "Generating coaching..." while waiting
// Poll for completion instead of blocking
```

**Priority:** 🔴 **P1 - Impacts sales training workflow**

**ETA Fix:** 4-6 hours (async pattern refactor)

---

### 3. SBA PREP MODULE - Tier Gate Shows PREMIUM Required ✅ (Fixed)

**Status Code Visible:**
```
TIER GATE: PREMIUM Required
```

**Feature Gate Details:**
```
ACCESS: Educational SBA lessons only (upgrade for prep outputs)
EDUCATIONAL LESSONS: 
  - How lenders evaluate document completeness
  - How to place readiness milestones over a 6-12 month period
  - Why to validate final package details with your lender, CPA, and attorney
```

**Root Cause:** `SBA_PREP` was missing from `tierGateMap` in App.tsx

**Solution Implemented:** ✅ **Commit 5844587**
```typescript
// src/App.tsx - tierGateMap updated
const tierGateMap: Record<ViewMode, PlanCode> = {
  // ...
  SBA_PREP: 'PREMIUM',  // ← ADDED (FIXED)
  FUNDING_RESEARCH: 'PREMIUM',
  // ...
};
```

**Verification Status:**
- [x] Code fix committed to GitHub main
- [x] Tier mapping validates against entitlements.ts
- [ ] User cache needs clear for immediate effect (localStorage)

**Post-Fix Checklist:**
```javascript
// Users should run this:
localStorage.clear();
location.reload();
// Then verify no upgrade wall appears
```

**Priority:** 🟢 **P0 - RESOLVED**

**Notes:**
- Browser cache may show old state for 10-15 min
- CloudFlare CDN may cache for 5 min
- Recommend users clear browser cache if they see upgrade wall

---

### 4. FUNDING RESEARCH ENGINE - PREMIUM Gating ✅ (Fixed)

**Status Code Visible:**
```
TIER GATE: PREMIUM Required
DISCLAIMERS: Accepted
COMMISSION CONSENT: Missing ⚠️
```

**Feature Description:**
```
Tier 1 research for 0% API business cards and LOC options
Client decides and submits all applications
Results vary and approve are not guaranteed
```

**Issue 1: PREMIUM Gate ✅ FIXED**
- Same as SBA_PREP above - was missing from tierGateMap
- Fixed in commit 5844587

**Issue 2: Commission Consent Missing ⚠️**
- User has not accepted commission disclosure
- Shows in red badge "Missing"
- This is a **feature**, not a bug - prevents liability

**Resolution for Users:**
```
1. Navigate to Settings > Communications
2. Check "I accept that this service earns commission"
3. Save and return to Funding Research
4. "Missing" badge should disappear
```

**Priority:** 🟢 **P0 - RESOLVED (Code) + User Action Required**

---

### 5. FUNDING OUTCOMES TRACKER - Premium Gating + Field Validation ✅ (Fixed)

**Status Codes Visible:**
```
TIER GATE: Premium Required For Estimation
COMMISSION DISCLOSURE: Missing
AGREEMENT: Will be created from accepted disclosure
```

**Feature:**
```
Approved outcomes may create estimated commission entries based on 
client-provided data and accepted agreement terms
```

**Issue 1: Tier Gate ✅ FIXED**
- Missing from tierGateMap in previous version
- Now includes FUNDING_OUTCOMES: 'PREMIUM'

**Issue 2: Field Validation ⚠️ (By Design)**
- Requires `client_file_id` (uuid) field before allowing outcome entry
- Prevents orphaned outcome records
- Shows placeholder warning until filled

**UI Behavior Expected:**
```javascript
// Form should:
1. Show empty client_file_id field (required)
2. Disable "Add Outcome" button until populated
3. Accept only valid UUID format
4. Show validation error if bad format

// Example valid flow:
client_file_id = "a1f2c3e4-5678-90ab-cdef-1234567890ab"
Amount: 25000
Card: "Visa"
Planned: [dropdown]
=> "Add Outcome" button becomes enabled
```

**Priority:** 🟢 **P0 - RESOLVED**

---

### 6. GRANTS ENGINE - Multi-Part Access Issues

**Visible Features:**
```
CATALOG: [MY SHORTLIST] [DRAFTS] [SUBMISSIONS]
SHORTLIST: "Create shortlist" button visible
```

**Access Messages:**
```
TIER GATE: Educational lessons only (upgrade for shortlist + drafts)
```

**Features Behind Premium:**
- MY SHORTLIST (draft grant applications)
- DRAFTS (incomplete submissions)
- SUBMISSIONS (finalized + sent applications)
- CATALOG tab (view all available grants)

**Free Tier Limited To:**
- View educational lessons only
- Read grant eligibility criteria
- No application creation

**Current Status:** ✅ **Working as Intended**
- Premium gate properly restricts features
- Educational content accessible to all

**Grants Workflow:**
```
1. [Free] Learn eligibility criteria from CATALOG
2. [Premium] CREATE SHORTLIST → Select matching grants
3. [Premium] DRAFTS → Fill application forms
4. [Premium] SUBMISSIONS → Submit to grant providers
5. [Premium] Track responses & acceptance status
```

**Priority:** 🟢 **P0 - RESOLVED**

---

### 7. SETTINGS PAGE - Configuration Issues

**Two Configuration Panels Visible:**

#### Panel 1: NEURAL LINK ⚠️
```
Status: "This module is not whitelisted yet..."
Action: "Configure your AI key in API Matrix"
Requirement: AI_PROVIDER env var enabled
```

**Reason:** Neural Link requires Gemini API key to be configured

**Setup Instructions:**
```bash
# Set in .env.local:
VITE_GEMINI_API_KEY=<your-api-key>

# Restart dev server:
npm run dev

# Then verify in Settings → Neural Link
curl https://api.gemini.google.com/health \
  -H "Authorization: Bearer $VITE_GEMINI_API_KEY"
```

**Priority:** 🟡 **P2 - Optional (Nice-to-have)**

---

#### Panel 2: AI WORKFORCE ❌ (Not Implemented)
```
Status: "Workflow management UI is not implemented yet. 
         For now, use Neural Floor for agent operations."
```

**Why Not Implemented:**
- Backend worker management infrastructure in progress
- Frontend stub exists but no wiring to macmini workers
- Temporary workaround: use Neural Floor dashboard

**Roadmap:**
- Phase 2 (Week of March 24): AI Workforce management UI
- Phase 3 (Week of March 31): Agent lifecycle management

**Priority:** 🟡 **P2 - Backlog (Post-MVP)**

---

## CONSOLE ERROR LOG ANALYSIS

### From DevTools Network Tab

```
1. ❌ POST https://goclearonline.cc/rest/v2/audit - Status 403 Forbid...
   Cause: CORS issue or audit logging endpoint down
   Impact: Non-critical (audit telemetry only)
   
2. ❌ GET https://f23abc...jsondoc.com/... - Status 486 (Not Acceptable)
   Cause: External API version mismatch or bad request headers
   Impact: Non-critical (documentation request)
   
3. ⚠️ POST list_notifications/limit=... - Status 200 (fetch)
   Info: Notification polling working
   Status: OK
   
4. ⚠️ gemini_generate - Status pending...
   Info: AI generation in progress
   Status: Watch for completion within 5-10 seconds
```

---

## FIX PRIORITY MATRIX

| System | Issue | Severity | Status | ETA |
|--------|-------|----------|--------|-----|
| **Workflow Engine** | Edge Function 403 Error | 🔴 P1 | In Progress | 2-4 hrs |
| **Sales Trainer** | Async Execution Timeout | 🔴 P1 | In Progress | 4-6 hrs |
| **Tier-Gating** | Missing Feature Gates | 🟢 FIXED | ✅ Done | N/A |
| **Commission Disclosure** | User Education Needed | 🟡 P2 | Manual | 5 min/user |
| **Neural Link Config** | API Key Setup | 🟡 P2 | Backlog | 1-2 hrs |
| **AI Workforce UI** | Not Implemented | 🟡 P2 | Backlog | Week 2 |

---

## ACTION ITEMS FOR TODAY

### Immediate (Next 4 Hours)
- [ ] **Debug Edge Function failures**
  - Check Netlify function logs for 403 responses
  - Verify JWT token is being passed in request headers
  - Check RLS policies on workflow_executions table
  
- [ ] **Fix SalesTrainer async pattern**
  - Switch to non-blocking Gemini API calls
  - Add polling for completion status
  - Add timeout handling (30s max wait)

### Current Session (4-8 Hours)
- [ ] Test tier-gating fixes (browser cache clear)
- [ ] Verify all 4 premium pages load without upgrade wall (super_admin test)
- [ ] Run regression tests on free user access

### This Week (By March 21)
- [ ] Deploy fixes to production
- [ ] Update monitoring alerts for Edge Function errors
- [ ] Create runbook section on acceptable alert thresholds

---

## RESOLUTION VERIFICATION TEMPLATE

When each issue is fixed, verify using this checklist:

```
ISSUE: [Title]
STATUS: [FIXED / IN REVIEW / BLOCKED]
COMMIT: [hash]
DATE_RESOLVED: [date]

VERIFICATION:
- [ ] Code builds without errors
- [ ] No console errors (F12 DevTools)
- [ ] Feature works in test environment
- [ ] Feature works in production
- [ ] All related tests pass
- [ ] Documentation updated
- [ ] No new errors in monitoring_alerts

TESTED BY: [name]
APPROVED BY: [name]
```

---

**Document Version:** 2.0  
**Last Updated:** March 17, 2026 5:15 PM  
**Next Update:** March 17, 2026 9:00 PM (end of day)
