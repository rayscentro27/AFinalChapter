import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_BASE_URL = 'https://goclearonline.cc';
const DEFAULT_ANON_KEY = 'sb_publishable_xaK6HiHDVSzOo5qJgwSdNQ_jxxeAuRi';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--base-url') out.baseUrl = argv[i + 1];
    if (a === '--strict-agent') out.strictAgent = true;
  }
  return out;
}

async function loadDotEnv(path) {
  try {
    const raw = await readFile(path, 'utf8');
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const idx = t.indexOf('=');
      if (idx < 1) continue;
      const key = t.slice(0, idx).trim();
      const value = t.slice(idx + 1).trim();
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

async function jsonReq(url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

function assert(condition, message, payload) {
  if (condition) return;
  const err = new Error(message);
  err.payload = payload;
  throw err;
}

function maskId(value) {
  if (!value || value.length < 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fileEnv = await loadDotEnv('.netlify/.env');
  const env = { ...fileEnv, ...process.env };

  const baseUrl = args.baseUrl || env.SMOKE_BASE_URL || DEFAULT_BASE_URL;
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

  assert(Boolean(supabaseUrl), 'Missing SUPABASE_URL');
  assert(Boolean(serviceRoleKey), 'Missing SUPABASE_SERVICE_ROLE_KEY');
  assert(Boolean(anonKey), 'Missing anon key');

  const stamp = Date.now();
  const email = `smokeh${stamp}@example.com`;
  const password = `SmokeTest!${stamp}`;
  const company = `Smoke Harness ${stamp}`;
  const slug = `smoke-harness-${stamp}`;

  const state = {
    email,
    userId: null,
    tenantId: null,
    membershipRole: null,
    createdTasks: 0,
    agents: [],
    runtimeStatus: null,
    runtimeOk: null,
    runtimePayload: null,
  };

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const signup = await jsonReq(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        options: { data: { role: 'client', company } },
      }),
    });

    let accessToken = signup.json?.access_token || '';
    state.userId = signup.json?.user?.id || null;

    if (!accessToken) {
      const signin = await jsonReq(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      accessToken = signin.json?.access_token || '';
      state.userId = signin.json?.user?.id || state.userId;

      assert(Boolean(accessToken), 'Could not sign in smoke user', { signup: signup.json, signin: signin.json });
    }

    assert(Boolean(state.userId), 'Smoke user id missing after auth', signup.json);

    const tenantInsert = await jsonReq(`${supabaseUrl}/rest/v1/tenants`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ name: company, slug, status: 'active' }),
    });

    assert(tenantInsert.ok, 'Tenant insert failed', tenantInsert.json);
    assert(Array.isArray(tenantInsert.json) && Boolean(tenantInsert.json[0]?.id), 'Tenant id missing', tenantInsert.json);

    state.tenantId = tenantInsert.json[0].id;

    const membershipInsert = await jsonReq(`${supabaseUrl}/rest/v1/tenant_memberships`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ tenant_id: state.tenantId, user_id: state.userId }),
    });

    assert(membershipInsert.ok, 'Membership insert failed', membershipInsert.json);
    state.membershipRole = Array.isArray(membershipInsert.json) ? membershipInsert.json[0]?.role || null : null;

    const assignResp = await jsonReq(`${baseUrl}/.netlify/functions/auto_assign_tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: state.tenantId,
        user_id: state.userId,
        answers: {
          has_business: false,
          needs_credit_help: true,
          credit_score: 645,
          has_derogatories: true,
          interested_in_grants: true,
        },
      }),
    });

    assert(assignResp.ok && assignResp.json?.ok, 'auto_assign_tasks failed', assignResp.json);
    state.createdTasks = Number(assignResp.json?.created || 0);
    assert(state.createdTasks > 0, 'auto_assign_tasks created 0 tasks', assignResp.json);

    const tasksResp = await jsonReq(
      `${supabaseUrl}/rest/v1/client_tasks?tenant_id=eq.${state.tenantId}&select=task_id,title,signal,status,assigned_employee&order=created_at.desc`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } }
    );

    assert(tasksResp.ok && Array.isArray(tasksResp.json), 'Task fetch failed', tasksResp.json);
    assert(tasksResp.json.length >= 3, 'Expected >= 3 tasks', tasksResp.json);

    state.agents = [...new Set(tasksResp.json.map((t) => t.assigned_employee).filter(Boolean))];

    const firstAgent = state.agents[0] || 'Nexus Analyst';
    const runtime = await jsonReq(`${baseUrl}/.netlify/functions/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee: firstAgent,
        user_message: 'Smoke harness check: confirm routing context.',
        context: { smoke_harness: true },
        mode: 'simulated',
        approval_mode: true,
        client_id: state.tenantId,
      }),
    });

    state.runtimeStatus = runtime.status;
    state.runtimeOk = runtime.ok;
    state.runtimePayload = runtime.json;

    if (args.strictAgent) {
      assert(runtime.ok, 'agent runtime failed in strict mode', runtime.json);
    }

    console.log('SMOKE_HARNESS_OK');
    console.log(
      JSON.stringify(
        {
          email: state.email,
          user_id: maskId(state.userId),
          tenant_id: maskId(state.tenantId),
          membership_role: state.membershipRole,
          created_tasks: state.createdTasks,
          assignees: state.agents,
          runtime_status: state.runtimeStatus,
          runtime_ok: state.runtimeOk,
          runtime_preview:
            typeof state.runtimePayload?.final_answer === 'string'
              ? state.runtimePayload.final_answer.slice(0, 140)
              : state.runtimePayload,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error('SMOKE_HARNESS_FAIL');
    console.error(JSON.stringify({ message: err.message, payload: err.payload || null }, null, 2));
    process.exitCode = 1;
  } finally {
    const cleanup = { tenantDeleted: false, userDeleted: false };

    if (state.tenantId) {
      const { error } = await admin.from('tenants').delete().eq('id', state.tenantId);
      cleanup.tenantDeleted = !error;
      if (error) {
        console.error('CLEANUP_WARNING tenant delete failed', error.message);
      }
    }

    if (state.userId) {
      const { error } = await admin.auth.admin.deleteUser(state.userId);
      cleanup.userDeleted = !error;
      if (error) {
        console.error('CLEANUP_WARNING user delete failed', error.message);
      }
    }

    console.log('SMOKE_HARNESS_CLEANUP');
    console.log(JSON.stringify({ tenant_id: maskId(state.tenantId), user_id: maskId(state.userId), ...cleanup }, null, 2));
  }
}

main();
