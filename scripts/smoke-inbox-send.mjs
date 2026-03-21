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

const provider = readArg('provider', process.env.SMOKE_PROVIDER || 'meta').toLowerCase();
const tenantId = readArg('tenant-id', process.env.SMOKE_TENANT_ID);
const conversationId = readArg('conversation-id', process.env.SMOKE_CONVERSATION_ID);
const contactId = readArg('contact-id', process.env.SMOKE_CONTACT_ID);
const recipientId = readArg('recipient-id', process.env.SMOKE_RECIPIENT_ID);
const text = readArg('text', process.env.SMOKE_TEXT || `Smoke test ${new Date().toISOString()}`);
const timeoutSeconds = Number(readArg('timeout-seconds', process.env.SMOKE_TIMEOUT_SECONDS || '60'));
const pollSeconds = Number(readArg('poll-seconds', process.env.SMOKE_POLL_SECONDS || '3'));

const gatewayBaseUrl = required('GATEWAY_BASE_URL', process.env.GATEWAY_BASE_URL);
const gatewayApiKey = required('GATEWAY_INTERNAL_API_KEY', process.env.GATEWAY_INTERNAL_API_KEY);
const smokeBearerToken = required('SMOKE_BEARER_TOKEN', process.env.SMOKE_BEARER_TOKEN || process.env.BEARER_TOKEN);
const supabaseUrl = required('SUPABASE_URL', process.env.SUPABASE_URL);
const supabaseServiceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);

required('tenant-id / SMOKE_TENANT_ID', tenantId);
if (!conversationId && !contactId) {
  if (!recipientId) {
    throw new Error('conversation-id, contact-id, or recipient-id is required');
  }
}

if (provider === 'sms' || provider === 'whatsapp' || provider === 'twilio') {
  throw new Error(`provider ${provider} is retired; use provider=meta`);
}

const useLegacyMetaSend = Boolean(recipientId && conversationId && !contactId);
const route = useLegacyMetaSend ? '/send/meta' : '/messages/send';
const payload = useLegacyMetaSend
  ? {
      tenant_id: tenantId,
      conversation_id: conversationId,
      text,
      recipient_id: recipientId,
    }
  : {
      tenant_id: tenantId,
      provider,
      body_text: text,
      ...(conversationId ? { conversation_id: conversationId } : {}),
      ...(contactId ? { contact_id: contactId } : {}),
    };

console.log('[smoke] sending', { route, provider, tenantId, conversationId: conversationId || null, contactId: contactId || null });

const sendRes = await fetch(`${gatewayBaseUrl.replace(/\/$/, '')}${route}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': gatewayApiKey,
    Authorization: `Bearer ${smokeBearerToken.replace(/^Bearer\s+/i, '')}`,
  },
  body: JSON.stringify(payload),
});

const sendJson = await sendRes.json().catch(() => ({}));
if (!sendRes.ok) {
  console.error('[smoke] send failed', sendJson);
  process.exit(1);
}

const outboxId = Number(sendJson?.outbox_id || 0);
console.log('[smoke] send ok', {
  outbox_id: outboxId || null,
  status: sendJson?.status || null,
  provider: sendJson?.provider || null,
});

if (!outboxId) {
  console.error('[smoke] no outbox_id returned, cannot poll status');
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
    .from('outbox_messages')
    .select('id, status, provider, provider_message_id, last_error, attempts, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('id', outboxId)
    .maybeSingle();

  if (error) {
    console.error('[smoke] poll error', error.message);
    process.exit(1);
  }

  if (!data) {
    console.log('[smoke] waiting for outbox row...');
    await sleep(pollSeconds * 1000);
    continue;
  }

  found = true;

  if (data.status !== lastStatus) {
    lastStatus = data.status;
    console.log('[smoke] status', {
      status: data.status,
      provider_message_id: data.provider_message_id,
      attempts: data.attempts,
      last_error: data.last_error || null,
    });
  }

  const status = String(data.status || '').toLowerCase();
  if (['sent', 'failed', 'canceled'].includes(status)) {
    console.log('[smoke] terminal status reached');
    process.exit(status === 'sent' ? 0 : 1);
  }

  await sleep(pollSeconds * 1000);
}

if (!found) {
  console.error('[smoke] timeout: outbox row not found');
  process.exit(1);
}

console.error('[smoke] timeout reached with non-terminal status', { status: lastStatus });
process.exit(1);
