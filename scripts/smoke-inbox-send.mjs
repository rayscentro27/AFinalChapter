import { createClient } from '@supabase/supabase-js';

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  return fallback;
}

function required(name, value) {
  if (!value) {
    throw new Error(`Missing required value: ${name}`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const provider = readArg('provider', process.env.SMOKE_PROVIDER || 'meta');
const tenantId = readArg('tenant-id', process.env.SMOKE_TENANT_ID);
const conversationId = readArg('conversation-id', process.env.SMOKE_CONVERSATION_ID);
const recipientId = readArg('recipient-id', process.env.SMOKE_RECIPIENT_ID);
const text = readArg('text', process.env.SMOKE_TEXT || `Smoke test ${new Date().toISOString()}`);
const timeoutSeconds = Number(readArg('timeout-seconds', process.env.SMOKE_TIMEOUT_SECONDS || '60'));
const pollSeconds = Number(readArg('poll-seconds', process.env.SMOKE_POLL_SECONDS || '3'));

const gatewayBaseUrl = required('GATEWAY_BASE_URL', process.env.GATEWAY_BASE_URL);
const gatewayApiKey = required('GATEWAY_INTERNAL_API_KEY', process.env.GATEWAY_INTERNAL_API_KEY);
const supabaseUrl = required('SUPABASE_URL', process.env.SUPABASE_URL);
const supabaseServiceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);

required('tenant-id / SMOKE_TENANT_ID', tenantId);
required('conversation-id / SMOKE_CONVERSATION_ID', conversationId);
required('recipient-id / SMOKE_RECIPIENT_ID', recipientId);

if (provider !== 'meta') {
  throw new Error(`provider must be meta, got ${provider}`);
}

const route = '/send/meta';
const payload = {
  tenant_id: tenantId,
  conversation_id: conversationId,
  recipient_id: recipientId,
  text,
};

console.log('[smoke] sending', { route, provider, tenantId, conversationId });

const sendRes = await fetch(`${gatewayBaseUrl.replace(/\/$/, '')}${route}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': gatewayApiKey,
  },
  body: JSON.stringify(payload),
});

const sendJson = await sendRes.json().catch(() => ({}));
if (!sendRes.ok) {
  console.error('[smoke] send failed', sendJson);
  process.exit(1);
}

const messageId = sendJson?.message_id;
console.log('[smoke] send ok', {
  message_id: messageId,
  provider_message_id_real: sendJson?.provider_message_id_real || null,
});

if (!messageId) {
  console.error('[smoke] no message_id returned, cannot poll status');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const stopAt = Date.now() + timeoutSeconds * 1000;
let lastStatus = null;
let found = false;

while (Date.now() < stopAt) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, status, provider, provider_message_id_real, error, sent_at, received_at, created_at')
    .eq('tenant_id', tenantId)
    .eq('id', messageId)
    .maybeSingle();

  if (error) {
    console.error('[smoke] poll error', error.message);
    process.exit(1);
  }

  if (!data) {
    console.log('[smoke] waiting for message row...');
    await sleep(pollSeconds * 1000);
    continue;
  }

  found = true;

  if (data.status !== lastStatus) {
    lastStatus = data.status;
    console.log('[smoke] status', {
      status: data.status,
      provider_message_id_real: data.provider_message_id_real,
      sent_at: data.sent_at,
      error: data.error || null,
    });
  }

  if (['delivered', 'read', 'failed'].includes(String(data.status || '').toLowerCase())) {
    console.log('[smoke] terminal status reached');
    process.exit(0);
  }

  await sleep(pollSeconds * 1000);
}

if (!found) {
  console.error('[smoke] timeout: message row not found');
  process.exit(1);
}

console.log('[smoke] timeout reached with non-terminal status', { status: lastStatus });
process.exit(0);
