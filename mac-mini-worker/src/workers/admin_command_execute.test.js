import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';

const { supabaseAdmin } = await import('../lib/supabase.js');
const { handleAdminCommandExecute } = await import('./admin_command_execute.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSupabaseMock(commandRow) {
  const originalFrom = supabaseAdmin.from;
  const state = {
    command: clone(commandRow),
  };

  supabaseAdmin.from = (table) => {
    if (table !== 'admin_commands') {
      throw new Error(`unexpected table: ${table}`);
    }

    const query = {
      filters: {},
      updatePayload: null,
    };

    const builder = {
      select() {
        return builder;
      },
      eq(column, value) {
        query.filters[column] = value;
        return builder;
      },
      update(payload) {
        query.updatePayload = payload;
        return builder;
      },
      single() {
        if (query.filters.id !== state.command.id) {
          return Promise.resolve({ data: null, error: { message: 'not found' } });
        }

        if (query.updatePayload) {
          state.command = { ...state.command, ...clone(query.updatePayload) };
        }

        return Promise.resolve({ data: clone(state.command), error: null });
      },
    };

    return builder;
  };

  return {
    get command() {
      return state.command;
    },
    restore() {
      supabaseAdmin.from = originalFrom;
    },
  };
}

test('handleAdminCommandExecute marks queued commands completed with safe result metadata', async () => {
  const mock = createSupabaseMock({
    id: 'command-1',
    tenant_id: 'tenant-1',
    command_text: 'run queue diagnostics',
    command_type: 'execution',
    parsed_intent: { target_label: 'Execution Pipeline' },
    status: 'queued',
    metadata: {},
  });

  try {
    const result = await handleAdminCommandExecute({
      id: 'job-1',
      payload: { command_id: 'command-1' },
    }, {
      worker_id: 'worker-1',
    });

    assert.equal(result.ok, true);
    assert.equal(mock.command.status, 'completed');
    assert.equal(mock.command.metadata.queue_job_id, 'job-1');
    assert.equal(mock.command.metadata.last_worker_id, 'worker-1');
    assert.equal(mock.command.metadata.execution_result.execution_mode, 'safe_noop');
  } finally {
    mock.restore();
  }
});