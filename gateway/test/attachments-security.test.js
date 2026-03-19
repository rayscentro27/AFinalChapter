import test from 'node:test';
import assert from 'node:assert/strict';

process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-internal-key';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';
process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-jwt-secret';
process.env.META_APP_SECRET = process.env.META_APP_SECRET || 'meta-app-secret';
process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'meta-verify-token';
process.env.META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || 'meta-page-token';
process.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
process.env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'twilio-auth-token';
process.env.TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '+15550001111';
process.env.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'wa-verify-token';
process.env.WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || 'wa-token';

const { resolveAttachmentLinkage } = await import('../src/routes/attachments.js');

class QueryMock {
  constructor(table, state) {
    this.table = table;
    this.state = state;
    this.filters = [];
  }

  select() {
    return this;
  }

  eq(column, value) {
    this.filters.push([column, value]);
    return this;
  }

  maybeSingle() {
    return this._execute();
  }

  _execute() {
    const rows = this.state[this.table] || [];
    const matched = rows.find((row) =>
      this.filters.every(([column, value]) => String(row?.[column]) === String(value))
    );
    return Promise.resolve({ data: matched || null, error: null });
  }
}

function createClient(state) {
  return {
    from(table) {
      return new QueryMock(table, state);
    },
  };
}

function fixtureState() {
  return {
    conversations: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        contact_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        contact_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        tenant_id: '22222222-2222-4222-8222-222222222222',
        contact_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      },
    ],
    messages: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        conversation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
        tenant_id: '22222222-2222-4222-8222-222222222222',
        conversation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      },
    ],
  };
}

test('resolveAttachmentLinkage derives conversation/contact from scoped message', async () => {
  const client = createClient(fixtureState());

  const linked = await resolveAttachmentLinkage({
    client,
    tenantId: '11111111-1111-4111-8111-111111111111',
    inputContactId: null,
    inputConversationId: null,
    inputMessageId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  });

  assert.deepEqual(linked, {
    contactId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    messageId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  });
});

test('resolveAttachmentLinkage rejects message and conversation mismatch', async () => {
  const client = createClient(fixtureState());

  await assert.rejects(
    () => resolveAttachmentLinkage({
      client,
      tenantId: '11111111-1111-4111-8111-111111111111',
      inputContactId: null,
      inputConversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      inputMessageId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    }),
    /message_conversation_mismatch/
  );
});

test('resolveAttachmentLinkage rejects contact and conversation mismatch', async () => {
  const client = createClient(fixtureState());

  await assert.rejects(
    () => resolveAttachmentLinkage({
      client,
      tenantId: '11111111-1111-4111-8111-111111111111',
      inputContactId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9',
      inputConversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      inputMessageId: null,
    }),
    /contact_conversation_mismatch/
  );
});

test('resolveAttachmentLinkage rejects cross-tenant message scope', async () => {
  const client = createClient(fixtureState());

  await assert.rejects(
    () => resolveAttachmentLinkage({
      client,
      tenantId: '11111111-1111-4111-8111-111111111111',
      inputContactId: null,
      inputConversationId: null,
      inputMessageId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
    }),
    /invalid_message_scope/
  );
});
