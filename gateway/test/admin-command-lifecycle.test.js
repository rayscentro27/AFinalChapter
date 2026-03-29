import test from 'node:test';
import assert from 'node:assert/strict';

process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-internal-key';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';
process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-jwt-secret';
process.env.TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'telegram-secret';

const { supabaseAdmin } = await import('../src/supabase.js');
const { createAdminCommand } = await import('../src/routes/admin_commands.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createQueryResult(state) {
  const table = state.table;
  const eq = state.filters.eq || {};
  const inFilters = state.filters.in || {};

  if (table === 'tenant_policies') {
    const rows = state.store.tenant_policies.filter((row) => {
      if (eq.tenant_id && row.tenant_id !== eq.tenant_id) return false;
      if (eq.action && row.action !== eq.action) return false;
      if (eq.is_active !== undefined && row.is_active !== eq.is_active) return false;
      return true;
    }).sort((left, right) => Number(left.priority || 100) - Number(right.priority || 100));
    return { data: clone(rows), error: null };
  }

  if (table === 'admin_commands') {
    let rows = state.store.admin_commands.slice();
    if (eq.id) rows = rows.filter((row) => row.id === eq.id);
    if (eq.tenant_id) rows = rows.filter((row) => row.tenant_id === eq.tenant_id);
    if (inFilters.status) rows = rows.filter((row) => inFilters.status.includes(row.status));
    return { data: clone(rows), error: null };
  }

  if (table === 'job_queue') {
    let rows = state.store.job_queue.slice();
    if (eq.id) rows = rows.filter((row) => row.id === eq.id);
    return { data: clone(rows), error: null };
  }

  return { data: [], error: null };
}

function createSupabaseMock({ policies = [] } = {}) {
  const originalFrom = supabaseAdmin.from;
  const store = {
    tenant_policies: clone(policies),
    admin_commands: [],
    job_queue: [],
    admin_command_approvals: [],
    control_plane_audit_log: [],
  };
  let nextId = 1;

  supabaseAdmin.from = (table) => {
    const state = {
      table,
      store,
      selectValue: '*',
      filters: { eq: {}, in: {} },
      insertPayload: null,
      updatePayload: null,
      orderBy: [],
      limitValue: null,
    };

    const builder = {
      select(value) {
        state.selectValue = value;
        return builder;
      },
      eq(column, value) {
        state.filters.eq[column] = value;
        return builder;
      },
      in(column, values) {
        state.filters.in[column] = values;
        return builder;
      },
      order(column, options = {}) {
        state.orderBy.push({ column, ascending: options.ascending !== false });
        return builder;
      },
      limit(value) {
        state.limitValue = value;
        return builder;
      },
      insert(payload) {
        state.insertPayload = payload;
        return builder;
      },
      update(payload) {
        state.updatePayload = payload;
        return builder;
      },
      maybeSingle() {
        const result = createQueryResult(state);
        const row = Array.isArray(result.data) ? result.data[0] || null : result.data || null;
        return Promise.resolve({ data: row, error: result.error });
      },
      single() {
        if (state.insertPayload !== null) {
          const input = Array.isArray(state.insertPayload) ? state.insertPayload[0] : state.insertPayload;
          const row = { id: `${table}-${nextId++}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...clone(input) };
          store[table].push(row);
          return Promise.resolve({ data: clone(row), error: null });
        }

        if (state.updatePayload !== null) {
          const rows = store[table] || [];
          const found = rows.find((row) => Object.entries(state.filters.eq).every(([key, value]) => row[key] === value));
          if (!found) return Promise.resolve({ data: null, error: { message: `${table} row not found` } });
          Object.assign(found, clone(state.updatePayload));
          return Promise.resolve({ data: clone(found), error: null });
        }

        const result = createQueryResult(state);
        const row = Array.isArray(result.data) ? result.data[0] || null : result.data || null;
        return Promise.resolve({ data: row, error: result.error });
      },
      then(resolve, reject) {
        return Promise.resolve(createQueryResult(state)).then(resolve, reject);
      },
    };

    return builder;
  };

  return {
    store,
    restore() {
      supabaseAdmin.from = originalFrom;
    },
  };
}

test('createAdminCommand queues low-risk command when auto-queue policy allows', async () => {
  const mock = createSupabaseMock();

  try {
    const result = await createAdminCommand({
      actor: { user_id: 'user-1', role: 'admin' },
      tenantId: 'tenant-1',
      commandText: 'run queue diagnostics',
      source: 'oracle_admin_api',
    });

    assert.equal(result.queue_handoff_failed, false);
    assert.equal(result.submitted.status, 'queued');
    assert.equal(mock.store.job_queue.length, 1);
    assert.equal(mock.store.job_queue[0].job_type, 'admin_command_execute');
  } finally {
    mock.restore();
  }
});

test('createAdminCommand routes auto-queue policy denials into approval', async () => {
  const mock = createSupabaseMock({
    policies: [{
      id: 'policy-1',
      tenant_id: 'tenant-1',
      is_active: true,
      priority: 10,
      effect: 'deny',
      action: 'admin_commands.auto_queue',
      conditions: { command_type: 'execution' },
      created_at: new Date().toISOString(),
    }],
  });

  try {
    const result = await createAdminCommand({
      actor: { user_id: 'user-1', role: 'admin' },
      tenantId: 'tenant-1',
      commandText: 'run queue diagnostics',
      source: 'oracle_admin_api',
    });

    assert.equal(result.queue_handoff_failed, false);
    assert.equal(result.submitted.status, 'requires_approval');
    assert.equal(mock.store.job_queue.length, 0);
  } finally {
    mock.restore();
  }
});

test('createAdminCommand blocks create when policy denies capture', async () => {
  const mock = createSupabaseMock({
    policies: [{
      id: 'policy-1',
      tenant_id: 'tenant-1',
      is_active: true,
      priority: 10,
      effect: 'deny',
      action: 'admin_commands.create',
      conditions: { source: 'telegram_webhook' },
      created_at: new Date().toISOString(),
    }],
  });

  try {
    await assert.rejects(
      createAdminCommand({
        actor: { user_id: null, role: 'telegram_bot' },
        tenantId: 'tenant-1',
        commandText: 'show latest briefing',
        source: 'telegram_webhook',
      }),
      /policy_denied:admin_commands.create/
    );

    assert.equal(mock.store.admin_commands.length, 0);
  } finally {
    mock.restore();
  }
});