import { randomUUID } from 'node:crypto';
import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { insertMessage } from '../db.js';
import {
  getConversationOrThrow,
  getChannelAccountOrThrow,
} from '../db_send.js';
import { twilioSendSMS } from '../providers/twilio.js';
import { whatsappSendText } from '../providers/whatsapp.js';
import { metaSendOutbox } from '../providers/meta_send_outbox.js';
import { requireTenantRole } from '../lib/auth/requireTenantRole.js';
import { ADMIN_RATE_LIMIT } from '../util/rate-limit.js';
import { sha256Hex } from '../util/hash.js';
import { redactText } from '../util/redact.js';
import {
  hasValidCronToken,
  isLocalRequest,
  parseAllowedTenantIds,
} from '../util/cron-auth.js';
import {
  tryAcquireTenantOutboxLock,
  releaseTenantOutboxLock,
} from '../util/outbox-lock.js';
import { resolveBestIdentityForSend } from '../util/send-route-selector.js';
import { recordSendFailure, recordSendSuccess } from '../lib/health/channelHealth.js';

const SUPPORTED_PROVIDERS = new Set(['twilio', 'whatsapp', 'meta']);
const BACKOFF_MINUTES = [1, 5, 15, 60, 360];
const NO_HEALTHY_ROUTE_BACKOFF_MINUTES = 5;

function requireApiKey(req, reply) {
  const key = req.headers['x-api-key'];
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    reply.code(401).send({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

async function requireApiKeyPreHandler(req, reply) {
  if (!requireApiKey(req, reply)) return;
  return undefined;
}

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function missingField(body, fields) {
  for (const field of fields) {
    if (body?.[field] === undefined || body?.[field] === null || body?.[field] === '') return field;
  }
  return null;
}

function isDuplicateError(error) {
  const code = String(error?.code || '').trim();
  if (code === '23505') return true;

  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('unique') || msg.includes('conflict');
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function computeBackoffMinutes(attempts) {
  const index = Math.max(0, Math.min(BACKOFF_MINUTES.length - 1, Number(attempts || 1) - 1));
  return BACKOFF_MINUTES[index];
}

function toJsonString(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
}

function getTenantIdFromRequest(req) {
  return (
    asText(req?.body?.tenant_id)
    || asText(req?.query?.tenant_id)
    || asText(req?.params?.tenant_id)
    || asText(req?.tenant?.id)
    || null
  );
}

function computeIdempotencyKey({ tenant_id, contact_id, provider, body_text, attachments, clientKey }) {
  const provided = asText(clientKey);
  if (provided) return provided;

  const minuteBucket = new Date().toISOString().slice(0, 16);
  const keyPayload = [
    tenant_id,
    contact_id || '',
    provider,
    body_text || '',
    toJsonString(attachments),
    minuteBucket,
  ].join('|');

  return `idem:${sha256Hex(keyPayload)}`;
}

async function getOutboxByIdempotency({ tenant_id, idempotency_key }) {
  const { data, error } = await supabaseAdmin
    .from('outbox_messages')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('idempotency_key', idempotency_key)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return null;
    throw new Error(`outbox idempotency lookup failed: ${error.message}`);
  }

  return data || null;
}

async function getOutboxByClientRequest({ tenant_id, client_request_id }) {
  if (!client_request_id) return null;

  const { data, error } = await supabaseAdmin
    .from('outbox_messages')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('client_request_id', client_request_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return null;
    throw new Error(`outbox legacy lookup failed: ${error.message}`);
  }

  return data || null;
}

async function tryInsertOutbox(row) {
  const { data, error } = await supabaseAdmin
    .from('outbox_messages')
    .insert(row)
    .select('*')
    .single();

  if (!error) return data;
  if (isDuplicateError(error)) return null;
  throw new Error(`outbox insert failed: ${error.message}`);
}

async function insertDeliveryEvent({ tenant_id, provider, provider_message_id, status, payload }) {
  const nowIso = new Date().toISOString();

  let insert = await supabaseAdmin
    .from('message_delivery_events')
    .insert({
      tenant_id,
      provider,
      provider_message_id,
      status,
      occurred_at: nowIso,
      payload: payload || {},
    });

  if (insert.error && (String(insert.error.message || '').toLowerCase().includes('column') && String(insert.error.message || '').toLowerCase().includes('status'))) {
    insert = await supabaseAdmin
      .from('message_delivery_events')
      .insert({
        tenant_id,
        provider,
        provider_message_id,
        event_type: status,
        created_at: nowIso,
        payload: payload || {},
      });
  }

  if (insert.error && !isMissingSchema(insert.error)) {
    throw new Error(`delivery event insert failed: ${insert.error.message}`);
  }
}

async function sendViaProvider(outbox) {
  const bodyText = asText(outbox.body_text) || asText(outbox.body);

  if (outbox.provider === 'twilio') {
    if (!bodyText) throw new Error('Missing outbound body_text for Twilio');
    return twilioSendSMS({
      to: outbox.to_address,
      body: bodyText,
      from: asText(outbox.from_address) || asText(ENV.TWILIO_FROM_NUMBER),
    });
  }

  if (outbox.provider === 'whatsapp') {
    if (!bodyText) throw new Error('Missing outbound body_text for WhatsApp');

    const phoneNumberId = asText(outbox.from_address);
    if (!phoneNumberId) throw new Error('Missing WhatsApp phone_number_id for outbound send');

    return whatsappSendText({
      phone_number_id: phoneNumberId,
      to: outbox.to_address,
      body: bodyText,
    });
  }

  if (outbox.provider === 'meta') {
    return metaSendOutbox(outbox, { supabaseAdmin });
  }

  throw new Error(`Unsupported provider: ${outbox.provider}`);
}

async function attemptSendOnce(outbox) {
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('outbox_messages')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', outbox.id)
    .in('status', ['queued', 'failed'])
    .select('*')
    .maybeSingle();

  if (claimError) throw new Error(`outbox claim failed: ${claimError.message}`);
  if (!claimed) return { outbox, skipped: true };

  const route = await resolveBestIdentityForSend({
    supabaseAdmin,
    outbox: claimed,
  });

  if (!route?.ok) {
    const { data: failedNoRoute, error: failNoRouteError } = await supabaseAdmin
      .from('outbox_messages')
      .update({
        status: 'failed',
        last_error: 'no_healthy_route',
        next_attempt_at: new Date(Date.now() + NO_HEALTHY_ROUTE_BACKOFF_MINUTES * 60000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimed.id)
      .select('*')
      .single();

    if (failNoRouteError) throw new Error(`outbox no-route update failed: ${failNoRouteError.message}`);

    return {
      outbox: failedNoRoute,
      sent: false,
      error: 'no_healthy_route',
      skipped_route: true,
    };
  }

  let claimedWithRoute = {
    ...claimed,
    channel_account_id: route.channel_account_id || claimed.channel_account_id,
    from_address: route.from_address || claimed.from_address,
  };

  if (claimedWithRoute.channel_account_id !== claimed.channel_account_id
    || claimedWithRoute.from_address !== claimed.from_address) {
    const { data: rerouted, error: rerouteError } = await supabaseAdmin
      .from('outbox_messages')
      .update({
        channel_account_id: claimedWithRoute.channel_account_id,
        from_address: claimedWithRoute.from_address,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimed.id)
      .eq('status', 'sending')
      .select('*')
      .maybeSingle();

    if (rerouteError) throw new Error(`outbox route update failed: ${rerouteError.message}`);
    if (rerouted) claimedWithRoute = rerouted;
  }

  try {
    const providerSend = await sendViaProvider(claimedWithRoute);
    const providerMessageId = asText(providerSend?.provider_message_id) || `missing:${randomUUID()}`;
    const attempts = Number(claimedWithRoute.attempts || 0) + 1;

    const { data: sentRow, error: sentError } = await supabaseAdmin
      .from('outbox_messages')
      .update({
        status: 'sent',
        provider_message_id: providerMessageId,
        channel_account_id: claimedWithRoute.channel_account_id || null,
        from_address: claimedWithRoute.from_address || null,
        last_error: null,
        attempts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimedWithRoute.id)
      .select('*')
      .single();

    if (sentError) throw new Error(`outbox sent update failed: ${sentError.message}`);

    await insertDeliveryEvent({
      tenant_id: sentRow.tenant_id,
      provider: sentRow.provider,
      provider_message_id: providerMessageId,
      status: 'sent',
      payload: {
        provider_response: providerSend?.raw || null,
        route: {
          channel_account_id: claimedWithRoute.channel_account_id || null,
          health_status: route.health_status || null,
        },
      },
    });

    const content = asObject(sentRow.content);
    if (asArray(sentRow.attachments).length > 0) {
      content.attachments = asArray(sentRow.attachments);
    }

    const messageId = await insertMessage({
      tenant_id: sentRow.tenant_id,
      conversation_id: sentRow.conversation_id,
      direction: 'out',
      provider: sentRow.provider,
      provider_message_id: providerMessageId,
      provider_message_id_real: providerMessageId,
      from_id: sentRow.from_address || 'system',
      to_id: sentRow.to_address,
      body: asText(sentRow.body_text) || asText(sentRow.body) || '',
      content,
      status: 'sent',
      received_at: new Date().toISOString(),
    });

    if (claimedWithRoute.channel_account_id) {
      try {
        await recordSendSuccess({
          supabaseAdmin,
          tenant_id: sentRow.tenant_id,
          channel_account_id: claimedWithRoute.channel_account_id,
          provider: sentRow.provider,
          context: {
            outbox_id: sentRow.id,
            provider_message_id: providerMessageId,
          },
        });
      } catch {
        // Health telemetry should never break send completion.
      }
    }

    return {
      outbox: sentRow,
      message_id: messageId || null,
      provider_message_id: providerMessageId,
      provider_message_id_real: providerMessageId,
      raw: providerSend?.raw || null,
      sent: true,
    };
  } catch (error) {
    const attempts = Number(claimedWithRoute.attempts || 0) + 1;
    const nextRetryMinutes = computeBackoffMinutes(attempts);
    const redactedError = redactText(String(error?.message || error)).slice(0, 5000);

    const { data: failedRow, error: failError } = await supabaseAdmin
      .from('outbox_messages')
      .update({
        status: 'failed',
        attempts,
        last_error: redactedError,
        next_attempt_at: new Date(Date.now() + nextRetryMinutes * 60000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimedWithRoute.id)
      .select('*')
      .single();

    if (failError) throw new Error(`outbox failed update failed: ${failError.message}`);

    if (claimedWithRoute.channel_account_id) {
      try {
        await recordSendFailure({
          supabaseAdmin,
          tenant_id: claimedWithRoute.tenant_id,
          channel_account_id: claimedWithRoute.channel_account_id,
          provider: claimedWithRoute.provider,
          error: redactedError,
          context: {
            outbox_id: claimedWithRoute.id,
            attempts,
            route_health_status: route.health_status || null,
          },
        });
      } catch {
        // Health telemetry should never break retry pipeline.
      }
    }

    return {
      outbox: failedRow,
      sent: false,
      error: String(error?.message || error),
    };
  }
}


async function buildOutboxInput(body) {
  const tenantId = String(body.tenant_id);
  const conversationId = String(body.conversation_id);
  const provider = lower(body.provider);

  const convo = await getConversationOrThrow({ tenant_id: tenantId, conversation_id: conversationId });
  const channel = await getChannelAccountOrThrow({
    tenant_id: tenantId,
    channel_account_id: convo.channel_account_id,
  });

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (lower(channel.provider) !== provider) {
    throw new Error(`Provider/channel mismatch. conversation channel is ${channel.provider}, request provider is ${provider}`);
  }

  const toAddress = provider === 'meta'
    ? asText(body.to_address) || asText(body.recipient_id)
    : asText(body.to_address) || asText(body.to);

  if (!toAddress) {
    throw new Error(provider === 'meta'
      ? 'Missing to_address or recipient_id'
      : 'Missing to_address or to');
  }

  const normalizedContent = asObject(body.content);
  const attachments = asArray(body.attachments).length > 0
    ? asArray(body.attachments)
    : asArray(normalizedContent.attachments);

  const bodyText = asText(body.body_text) || asText(body.body) || asText(body.text);

  if (!bodyText && !(provider === 'meta' && attachments.length > 0)) {
    throw new Error('Missing body_text/body/text');
  }

  let fromAddress = asText(body.from_address);
  if (!fromAddress) {
    if (provider === 'twilio') fromAddress = asText(channel.external_account_id) || asText(ENV.TWILIO_FROM_NUMBER);
    if (provider === 'whatsapp') fromAddress = asText(channel.external_account_id);
    if (provider === 'meta') fromAddress = asText(channel.external_account_id);
  }

  const idempotencyKey = computeIdempotencyKey({
    tenant_id: tenantId,
    contact_id: convo.contact_id,
    provider,
    body_text: bodyText,
    attachments,
    clientKey: body.idempotency_key || body.client_request_id,
  });

  return {
    tenant_id: tenantId,
    contact_id: convo.contact_id,
    conversation_id: conversationId,
    provider,
    channel_account_id: convo.channel_account_id,
    to_address: toAddress,
    from_address: fromAddress,
    body_text: bodyText,
    body: bodyText,
    attachments,
    content: normalizedContent,
    idempotency_key: idempotencyKey,
    client_request_id: asText(body.client_request_id) || idempotencyKey,
    status: 'queued',
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    created_by: asText(body.created_by),
    updated_at: new Date().toISOString(),
    identity_id: asText(body.identity_id) || null,
  };
}

async function buildQueueOnlyInput(body) {
  const tenantId = String(body.tenant_id);
  const provider = lower(body.provider);
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const conversationId = asText(body.conversation_id);
  let conversation = null;
  if (conversationId) {
    conversation = await getConversationOrThrow({ tenant_id: tenantId, conversation_id: conversationId });
  }

  const contactId = asText(body.contact_id) || asText(conversation?.contact_id);
  if (!contactId) {
    throw new Error('Missing contact_id (or conversation_id with linked contact)');
  }

  const bodyText = asText(body.body_text) || asText(body.body) || asText(body.text);
  if (!bodyText) throw new Error('Missing body_text');

  const attachments = asArray(body.attachments);
  const idempotencyKey = computeIdempotencyKey({
    tenant_id: tenantId,
    contact_id: contactId,
    provider,
    body_text: bodyText,
    attachments,
    clientKey: body.idempotency_key || body.client_request_id,
  });

  const toAddress = asText(body.to_address) || asText(body.to) || asText(body.recipient_id) || null;

  return {
    tenant_id: tenantId,
    contact_id: contactId,
    conversation_id: conversationId,
    provider,
    identity_id: asText(body.identity_id) || null,
    idempotency_key: idempotencyKey,
    body_text: bodyText,
    body: bodyText,
    attachments,
    content: asObject(body.content),
    status: 'queued',
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    created_by: asText(body.created_by),
    updated_at: new Date().toISOString(),
    client_request_id: asText(body.client_request_id) || idempotencyKey,
    to_address: toAddress,
    from_address: asText(body.from_address) || null,
  };
}

async function queueWithIdempotency(outboxInput) {
  let outboxRow = await tryInsertOutbox(outboxInput);
  let deduped = false;

  if (!outboxRow) {
    outboxRow = await getOutboxByIdempotency({
      tenant_id: outboxInput.tenant_id,
      idempotency_key: outboxInput.idempotency_key,
    });

    if (!outboxRow) {
      outboxRow = await getOutboxByClientRequest({
        tenant_id: outboxInput.tenant_id,
        client_request_id: outboxInput.client_request_id,
      });
    }

    deduped = Boolean(outboxRow);
  }

  if (!outboxRow) {
    throw new Error('outbox dedupe lookup failed after duplicate insert');
  }

  return { outboxRow, deduped };
}

async function runOutboxBatch({ tenantId = null, limit = 25 }) {
  const now = new Date().toISOString();

  let query = supabaseAdmin
    .from('outbox_messages')
    .select('*')
    .in('status', ['queued', 'failed'])
    .lte('next_attempt_at', now)
    .order('next_attempt_at', { ascending: true })
    .limit(limit);

  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data: rows, error } = await query;
  if (error) throw new Error(`Failed loading outbox jobs: ${error.message}`);

  let processed = 0;
  let sent = 0;
  let failed = 0;
  const items = [];

  for (const row of rows || []) {
    const result = await attemptSendOnce(row);
    processed += 1;

    if (result.sent) sent += 1;
    else if (!result.skipped) failed += 1;

    items.push({
      outbox_id: row.id,
      status: result.sent ? 'sent' : (result.skipped ? 'skipped' : 'failed'),
      provider_message_id: result.provider_message_id || null,
      error: result.error || null,
    });
  }

  return { processed, sent, failed, items };
}

export async function outboxRoutes(fastify) {
  const agentRoleGuard = requireTenantRole({
    supabaseAdmin,
    allowedRoles: ['owner', 'admin', 'agent'],
  });

  const cronTenantAllowlist = parseAllowedTenantIds(ENV.ORACLE_TENANT_IDS);

  async function requireOutboxRunnerAuth(req, reply) {
    const tenantId = getTenantIdFromRequest(req);
    if (!tenantId) {
      return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
    }

    req.outboxTenantId = tenantId;

    const hasCronHeader = Boolean(asText(req.headers['x-cron-token']));
    if (hasCronHeader) {
      if (!hasValidCronToken(req, ENV.ORACLE_CRON_TOKEN)) {
        return reply.code(401).send({ ok: false, error: 'invalid_cron_token' });
      }

      if (!isLocalRequest(req)) {
        return reply.code(403).send({ ok: false, error: 'cron_not_from_localhost' });
      }

      if (cronTenantAllowlist.size === 0) {
        return reply.code(500).send({ ok: false, error: 'cron_tenant_allowlist_not_configured' });
      }

      if (!cronTenantAllowlist.has(tenantId)) {
        return reply.code(403).send({ ok: false, error: 'tenant_not_allowed_for_cron' });
      }

      req.user = { id: 'system:cron', jwt: null };
      req.tenant = { id: tenantId, role: 'system' };
      req.auth_mode = 'cron';
      return undefined;
    }

    await agentRoleGuard(req, reply);
    if (reply.sent) return undefined;

    const scopedTenantId = asText(req.tenant?.id);
    if (scopedTenantId && scopedTenantId !== tenantId) {
      return reply.code(403).send({ ok: false, error: 'tenant_scope_mismatch' });
    }

    req.auth_mode = 'user';
    return undefined;
  }

  fastify.post('/messages/send', {
    preHandler: [requireApiKeyPreHandler, agentRoleGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const body = req.body || {};
    const missing = missingField(body, ['tenant_id', 'provider']);
    if (missing) {
      return reply.code(400).send({ ok: false, error: `Missing ${missing}` });
    }

    try {
      const outboxInput = await buildQueueOnlyInput({
        ...body,
        tenant_id: body.tenant_id || req.tenant?.id,
        created_by: req.user?.id,
      });

      const { outboxRow, deduped } = await queueWithIdempotency(outboxInput);

      return reply.send({
        ok: true,
        outbox_id: outboxRow.id,
        status: outboxRow.status,
        deduped,
      });
    } catch (error) {
      return reply.code(400).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/send/outbox', async (req, reply) => {
    if (!requireApiKey(req, reply)) return;

    const body = req.body || {};
    const missing = missingField(body, ['tenant_id', 'conversation_id', 'provider']);
    if (missing) {
      return reply.code(400).send({ ok: false, error: `Missing ${missing}` });
    }

    try {
      const outboxInput = await buildOutboxInput(body);
      const { outboxRow, deduped } = await queueWithIdempotency(outboxInput);

      if (outboxRow.status === 'sent') {
        return reply.send({
          ok: true,
          deduped: true,
          send_attempted: false,
          outbox: outboxRow,
          provider_message_id: outboxRow.provider_message_id || null,
          provider_message_id_real: outboxRow.provider_message_id || null,
        });
      }

      if (outboxRow.status === 'canceled') {
        return reply.code(409).send({
          ok: false,
          error: 'Outbox row is canceled',
          outbox: outboxRow,
          deduped,
        });
      }

      if (outboxRow.status === 'sending') {
        return reply.code(202).send({
          ok: true,
          deduped,
          send_attempted: false,
          outbox: outboxRow,
        });
      }

      const attempt = await attemptSendOnce(outboxRow);

      if (!attempt.sent) {
        return reply.code(502).send({
          ok: false,
          deduped,
          send_attempted: true,
          outbox: attempt.outbox,
          error: attempt.error || 'Provider send failed',
        });
      }

      return reply.send({
        ok: true,
        deduped,
        send_attempted: true,
        outbox: attempt.outbox,
        message_id: attempt.message_id || null,
        provider_message_id: attempt.provider_message_id || attempt.outbox?.provider_message_id || null,
        provider_message_id_real: attempt.provider_message_id_real || attempt.outbox?.provider_message_id || null,
        raw: attempt.raw || null,
      });
    } catch (error) {
      return reply.code(400).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/admin/outbox/run', {
    preHandler: [requireApiKeyPreHandler, requireOutboxRunnerAuth],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const requested = Number(req.body?.limit || 25);
    const limit = Math.min(100, Math.max(1, Number.isFinite(requested) ? requested : 25));
    const tenantId = req.outboxTenantId || getTenantIdFromRequest(req);

    if (!tenantId) {
      return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
    }

    const lock = await tryAcquireTenantOutboxLock({ tenantId });
    if (!lock.acquired) {
      if (lock.reason === 'lock_not_acquired') {
        return reply.send({ ok: true, skipped: true, reason: 'lock_not_acquired', tenant_id: tenantId });
      }

      return reply.code(500).send({ ok: false, error: 'lock_unavailable', reason: lock.reason || 'unknown' });
    }

    try {
      const result = await runOutboxBatch({ tenantId, limit });
      return reply.send({
        ok: true,
        tenant_id: tenantId,
        auth_mode: req.auth_mode || 'unknown',
        ...result,
      });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    } finally {
      try {
        await releaseTenantOutboxLock({ tenantId });
      } catch (releaseError) {
        req.log.warn({ err: releaseError, tenant_id: tenantId }, 'outbox lock release failed');
      }
    }
  });

  fastify.post('/outbox/worker', async (req, reply) => {
    if (!requireApiKey(req, reply)) return;

    const requested = Number(req.body?.limit || 25);
    const limit = Math.min(100, Math.max(1, Number.isFinite(requested) ? requested : 25));
    const tenantId = asText(req.body?.tenant_id);

    try {
      const result = await runOutboxBatch({ tenantId, limit });
      return reply.send({ ok: true, tenant_id: tenantId || null, ...result });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });
}
