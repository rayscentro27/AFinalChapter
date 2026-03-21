# IMMEDIATE ACTION PLAN - Critical Error Fixes (March 17, 2026)

## PRIORITY 1: Edge Function Non-2xx Status Code

### WHERE IT FAILS
- Workflow Detail page (workflow_id=70fdb35-2b02-4aca-a65e-66cccb1c445)
- Sales Trainer instance execution
- Any `.netlify/functions/workflow-engine` or similar calls returning 403/401

### DEBUGGING CHECKLIST

#### Step 1: Check Netlify Functions Logs (Immediate)
```bash
# Terminal command to see real-time logs
netlify logs functions --tail

# Or check historical logs for the past hour
netlify logs functions --time=60m --filter=workflow

# Expected output:
# [error] POST /.netlify/functions/workflow-engine 403
# [info] Failed: Missing bearer token
# OR
# [error] RLS policy violation on workflow_executions table
```

**If you see:**
- `403 Forbidden` → Go to **Issue A** below
- `401 Unauthorized` → Go to **Issue B** below
- `500 Internal Server Error` → Go to **Issue C** below

---

#### Step 2: Test Directly from Terminal

```bash
# Get a fresh JWT token
export JWT_TOKEN=$(curl -X POST http://localhost:54321/auth/v1/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "password",
    "email": "test@example.com",
    "password": "Test123!",
    "issuer": "https://supabase.local"
  }' | jq -r '.access_token')

echo "JWT Token: $JWT_TOKEN"

# Test the workflow function directly
curl -X POST http://localhost:8888/.netlify/functions/workflow-engine \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $(uuidgen)" \
  -d '{
    "action": "getStep",
    "workflow_id": "70fdb35-2b02-4aca-a65e-66cccb1c445",
    "step_number": 1
  }' \
  -v

# Look for response headers and status code
# Expected: 200 with JSON body
```

---

### THREE POSSIBLE ISSUES & FIXES

#### ISSUE A: Missing Bearer Token in Request Header

**Symptom:**
```
403 Forbidden
Response: "Unauthorized"
```

**Location to Check:** `src/services/workflowService.ts` or `components/WorkflowDetail.tsx`

**Root Cause Code:**
```typescript
// ❌ BAD - No token
const response = await fetch('/.netlify/functions/workflow-engine', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({...})
});

// ✅ GOOD - With token
import { useAuth } from '@/contexts/AuthContext';

const { session } = useAuth();
const response = await fetch('/.netlify/functions/workflow-engine', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token}`  // ← ADD THIS
  },
  body: JSON.stringify({...})
});
```

**Quick Fix:**
```bash
# Find which file makes the request
grep -r "workflow-engine" src/ --include="*.tsx" --include="*.ts"

# Look for any fetch/axios calls without Authorization header
grep -r "\.netlify/functions/workflow-engine" src/ -A 5 -B 5
```

---

#### ISSUE B: RLS Policy Blocking Access

**Symptom:**
```
403 Forbidden
Response: "RLS policy violation: tenant_id mismatch"
```

**Likely Cause:** User's JWT contains `tenant_id: uuid-A` but trying to access workflow under `tenant_id: uuid-B`

**Location to Check:** `supabase/migrations/*_rls_policies.sql`

**How to Verify:**
```sql
-- Check RLS policy on workflow_executions table
SELECT 
  schemaname, tablename, policyname, 
  qual as "Policy Expression"
FROM pg_policies 
WHERE tablename = 'workflow_executions';

-- Example RLS policy:
-- (auth.jwt() ->> 'tenant_id')::uuid = tenant_id

-- This means: Only access rows where JWT tenant_id matches row tenant_id
```

**Quick Fix:**
```sql
-- If policy is too restrictive, check if current_tenant_id is set
SELECT current_setting('app.current_tenant_id', true) AS tenant_id;

-- Set it at function start time
SET app.current_tenant_id = auth.jwt()->>'tenant_id';

-- Then retry the workflow function
```

**In Netlify Function Code:**
```typescript
// netlify/functions/workflow-engine.ts
import { createClient } from '@supabase/supabase-js';

export default async (req) => {
  const supabase = createClient(DB_URL, DB_KEY);
  
  // Extract tenant from JWT
  const token = req.headers.authorization?.replace('Bearer ', '');
  const jwt = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  const tenantId = jwt.tenant_id;
  
  // Set tenant context BEFORE querying
  await supabase.rpc('set_tenant_context', { tenant_id: tenantId });
  
  // Now queries will respect RLS
  const { data, error } = await supabase
    .from('workflow_executions')
    .select('*')
    .eq('id', workflow_id);
  
  if (error) {
    console.error('RLS Error:', error);
    return { statusCode: 403, body: JSON.stringify(error) };
  }
  
  return { statusCode: 200, body: JSON.stringify(data) };
};
```

---

#### ISSUE C: Server Error (500)

**Symptom:**
```
500 Internal Server Error
Response: Stack trace or generic error
```

**Cause:** Exception in the function code itself

**Quick Fix:**
```bash
# Check full error stack in Netlify logs
netlify logs functions --filter=workflow-engine --format=json

# Look for:
# - TypeError: Cannot read property X of undefined
# - Database connection errors
# - Missing environment variables
```

**Most Common:**
```typescript
// ❌ Missing env var
const apiKey = process.env.GEMINI_API_KEY; // undefined
await gemini.call({ key: apiKey }); // Error!

// ✅ With validation
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY not set');
```

---

### VERIFICATION STEPS

Once you think you fixed it:

```bash
# 1. Rebuild locally
npm run build

# 2. Test function in dev
netlify dev --functions netlify/functions

# 3. In browser, navigate to workflow detail page
# 4. Click "COMPLETE STEP + ADVANCE"
# 5. Should see step 2 load (or error, but different error)

# 6. Check console for any errors
# Press F12, go to Console tab
# Should be clean (no 403/401 errors)

# 7. Check Netlify log output
# Terminal should show:
# [info] POST /.netlify/functions/workflow-engine 200
```

---

## PRIORITY 2: SalesTrainer Async Execution Timeout

### WHERE IT FAILS
- SalesTrainer component (Combat Coach live coaching)
- Workflow shows "ACTIVE" but fails during step execution
- "Next task: Update AnnualCreditReport PDF" unreachable

### ROOT CAUSE ANALYSIS

**Current Pattern (Blocking):**
```typescript
// ❌ BLOCKS entire component while waiting
const coaching = await geminiService.generateCoaching({
  context: call.transcript,
  objective: scenario.objective,
  instruction: null
});
// If Gemini takes 30 seconds, UI freezes for 30 seconds
```

**Why It Fails:**
1. Gemini API call takes 10-30 seconds
2. Browser timeout (usually 30-60s) gets hit
3. Component never receives response
4. User sees "failed" state or loading spinner forever

### THE FIX

**Convert to Non-Blocking Pattern:**

```typescript
// ✅ NON-BLOCKING with polling
const [coachingState, setCoachingState] = useState<{
  status: 'idle' | 'generating' | 'complete' | 'error',
  coaching?: string,
  error?: string
}>({ status: 'idle' });

// Start generation WITHOUT waiting
const handleGenerateCoaching = async () => {
  setCoachingState({ status: 'generating' });
  
  // Fire and forget - don't await
  geminiService.generateCoaching({
    context: call.transcript,
    objective: scenario.objective
  })
    .then(coaching => {
      setCoachingState({ status: 'complete', coaching });
    })
    .catch(err => {
      setCoachingState({ status: 'error', error: err.message });
    });
};

// Render shows "Generating..." while polling
return (
  <div>
    {coachingState.status === 'generating' && (
      <div>✨ Generating coaching insight...</div>
    )}
    {coachingState.status === 'complete' && (
      <div>{coachingState.coaching}</div>
    )}
    {coachingState.status === 'error' && (
      <div className="error">Failed: {coachingState.error}</div>
    )}
  </div>
);
```

### FILE TO MODIFY

**Location:** `src/components/SalesTrainer.tsx`

**Search for:**
```typescript
const coaching = await geminiService.generateCoaching
```

**Replace with:** Non-blocking pattern above

**Also check:**
- Any `await geminiService.*` calls in the component
- Any `await gemini.generate` calls
- Convert all to non-blocking promises

---

### TESTING THE FIX

```bash
# 1. Edit the component
vim src/components/SalesTrainer.tsx

# 2. Apply non-blocking pattern
# 3. Save and dev server auto-reloads

# 4. Open DevTools (F12)
# 5. Navigate to Combat Coach
# 6. Start a live coaching session
# 7. Should see "✨ Generating..." message
# 8. After 10-30s, coaching insight appears
# 9. No UI freeze, can interact with page
```

### VALIDATION

```typescript
// In DevTools Console, run:
// Should show coaching being generated in background
performance.mark('coaching-start');
// ... click generate ...
// When coaching appears:
performance.mark('coaching-end');
performance.measure('coaching', 'coaching-start', 'coaching-end');
const measure = performance.getEntriesByName('coaching')[0];
console.log(`Coaching generation took ${measure.duration}ms`);
// Expected: 10000-30000ms (10-30 seconds)
// If less than 1 second: Already cached/fast
// If timeout (>60s): Still broken, needs more debugging
```

---

## SUMMARY OF BOTH FIXES

| Fix | File | Change | ETA |
|-----|------|--------|-----|
| **Edge Function** | `src/services/workflowService.ts` (or caller) | Add `Authorization` header with JWT | 1-2 hrs debug + 30 min apply |
| **SalesTrainer** | `src/components/SalesTrainer.tsx` | Convert `await gemini.generateCoaching()` to non-blocking promise | 2-3 hrs refactor + 30 min test |

---

## TESTING CHECKLIST

### After Applying Fixes

```
WORKFLOW ENGINE FIX
- [ ] Workflow detail page loads
- [ ] "REFRESH" button works (returns step details)
- [ ] "COMPLETE STEP + ADVANCE" executes without 403 error
- [ ] Next step loads
- [ ] No console errors (F12)
- [ ] Netlify logs show 200 responses

SALES TRAINER FIX
- [ ] Combat Coach loads
- [ ] Start live coaching session
- [ ] Click "Generate Coaching"
- [ ] See "✨ Generating..." message
- [ ] After 10-30 seconds, coaching appears
- [ ] Can navigate/interact while generating (no freeze)
- [ ] No console errors
```

---

## ROLLBACK PLAN (If Fix Breaks Something)

```bash
# If new fix causes worse errors:
git revert <commit-hash>
git push origin main
netlify deploy --prod

# Then debug further with narrower approach
```

---

**Action Plan Created:** March 17, 2026  
**Estimated Completion:** March 17, 2026 by 11 PM  
**Owner:** [Your Name]  
**Status:** Ready to Execute
