import { randomUUID } from 'node:crypto';
import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { insertMessage } from '../db.js';
import {
  getConversationOrThrow,
  getChannelAccountOrThrow,
} from '../db_send.js';
import { metaSendOutbox } from '../providers/meta_send_outbox.js';
import { requireTenantPermission } from '../lib/auth/requireTenantPermission.js';
import { evaluatePolicy } from '../lib/policy/policyEngine.js';
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
import { resolveBestIdentityForQueue, resolveBestIdentityForSend } from '../util/send-route-selector.js';
import { recordSendFailure, recordSendSuccess } from '../lib/health/channelHealth.js';
import { checkLimit } from '../lib/billing/planEnforcer.js';
import { logAudit } from '../lib/audit/auditLog.js';
import { buildWebhookEventKey, queueOutgoingWebhookEvent } from '../lib/public-api/webhookDispatcher.js';

const SUPPORTED_PROVIDERS = new Set(['meta']);
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

function isMissingColumnProjection(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('column')
    && (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes("could not find the '"));
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

async function loadAttachmentsByIds({ tenant_id, attachmentIds }) {
  const ids = Array.from(new Set((attachmentIds || []).filter((id) => isUuid(id))));
  if (!ids.length) return [];

  const selectCandidates = [
    'id,tenant_id,storage_bucket,storage_path,content_type,size_bytes,sha256,created_at',
    'id,tenant_id,storage_bucket,storage_path,mime_type,size_bytes,created_at',
    'id,tenant_id,storage_bucket,storage_path,mime_type,size_bytes,provider_media_id,created_at',
  ];

  let lastError = null;

  for (const select of selectCandidates) {
    const { data, error } = await supabaseAdmin
      .from('attachments')
      .select(select)
      .eq('tenant_id', tenant_id)
      .in('id', ids);

    if (!error) return data || [];

    if (isMissingColumnProjection(error)) {
      lastError = error;
      continue;
    }

    if (isMissingSchema(error)) return [];
    throw new Error(`attachments lookup failed: ${error.message}`);
  }

  if (lastError && isMissingSchema(lastError)) return [];
  throw new Error(`attachments lookup failed: ${lastError?.message || 'unknown_error'}`);
}

function normalizeAttachmentRecord(row) {
  return {
    attachment_id: asText(row?.id),
    storage_bucket: asText(row?.storage_bucket) || 'attachments',
    storage_path: asText(row?.storage_path),
    content_type: asText(row?.content_type || row?.mime_type) || 'application/octet-stream',
    size_bytes: Number(row?.size_bytes || 0),
    sha256: asText(row?.sha256) || null,
    created_at: asText(row?.created_at) || null,
  };
}

function normalizeAttachmentObject(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const storagePath = asText(item.storage_path);
  if (!storagePath) return null;

  return {
    attachment_id: isUuid(item.attachment_id) ? asText(item.attachment_id) : null,
    storage_bucket: asText(item.storage_bucket) || 'attachments',
    storage_path: storagePath,
    content_type: asText(item.content_type || item.mime_type) || 'application/octet-stream',
    size_bytes: Number(item.size_bytes || 0),
    sha256: asText(item.sha256) || null,
  };
}

async function normalizeAttachmentsForOutbox({ tenant_id, attachments, content }) {
  const source = asArray(attachments).length > 0
    ? asArray(attachments)
    : asArray(asObject(content).attachments);

  if (!source.length) return [];

  const attachmentIds = [];
  const passthrough = [];

  for (const item of source) {
    if (typeof item === 'string' && isUuid(item)) {
      attachmentIds.push(asText(item));
      continue;
    }

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const itemId = asText(item.attachment_id || item.id);
      if (isUuid(itemId)) {
        attachmentIds.push(itemId);
        continue;
      }

      const normalized = normalizeAttachmentObject(item);
      if (normalized) passthrough.push(normalized);
    }
  }

  const fromDb = await loadAttachmentsByIds({ tenant_id, attachmentIds });
  const fromDbNormalized = fromDb.map(normalizeAttachmentRecord).filter((row) => row.storage_path);

  if (attachmentIds.length && fromDbNormalized.length !== Array.from(new Set(attachmentIds)).length) {
    throw new Error('one_or_more_attachments_not_found_for_tenant');
  }

  const dedup = new Map();
  for (const item of [...fromDbNormalized, ...passthrough]) {
    const key = `${item.storage_bucket}:${item.storage_path}`;
    if (!dedup.has(key)) dedup.set(key, item);
  }

  return Array.from(dedup.values());
}

async function signedAttachmentUrls(attachments, expiresSec = 3600) {
  const out = [];
  for (const item of attachments || []) {
    const bucket = asText(item?.storage_bucket) || 'attachments';
    const storagePath = asText(item?.storage_path);
    if (!storagePath) continue;

    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(storagePath, expiresSec);
    if (error) throw new Error(`attachment signed URL failed: ${error.message}`);

    const url = asText(data?.signedUrl);
    if (url) out.push(url);
  }
  return out;
}

function appendLinksToBody(bodyText, urls) {
  const links = asArray(urls).filter(Boolean);
  if (!links.length) return asText(bodyText);

  const text = asText(bodyText) || '';
  const block = links.map((u, i) => `Attachment ${i + 1}: ${u}`).join('\n');
  return text ? `${text}\n\n${block}` : block;
}

async function sendViaProvider(outbox) {
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


    if (messageId) {
      await queueOutgoingWebhookEvent({
        tenant_id: sentRow.tenant_id,
        event_type: 'message.created',
        event_key: buildWebhookEventKey('message.created', {
          message_id: messageId,
          provider_message_id: providerMessageId,
        }),
        payload: {
          message_id: messageId,
          conversation_id: sentRow.conversation_id || null,
          contact_id: sentRow.contact_id || null,
          provider: sentRow.provider,
          status: 'sent',
          provider_message_id: providerMessageId,
        },
      }).catch(() => {});
    }

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
  const attachments = await normalizeAttachmentsForOutbox({
    tenant_id: tenantId,
    attachments: asArray(body.attachments),
    content: normalizedContent,
  });

  if (attachments.length > 0) normalizedContent.attachments = attachments;

  const bodyText = asText(body.body_text) || asText(body.body) || asText(body.text);

  if (!bodyText && attachments.length === 0) {
    throw new Error('Missing body_text/body/text or attachments');
  }

  let fromAddress = asText(body.from_address);
  if (!fromAddress && provider === 'meta') {
    fromAddress = asText(channel.external_account_id);
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
  const preferredProvider = lower(body.provider || body.channel_preference || '');
  if (preferredProvider && !SUPPORTED_PROVIDERS.has(preferredProvider)) {
    throw new Error(`Unsupported provider: ${preferredProvider}`);
  }
  const conversationId = asText(body.conversation_id);
  let conversation = null;
  if (conversationId) {
    conversation = await getConversationOrThrow({ tenant_id: tenantId, conversation_id: conversationId });
  }

  const contactId = asText(body.contact_id) || asText(conversation?.contact_id);
  if (!contactId && !conversationId) {
    throw new Error('Missing contact_id or conversation_id');
  }

  const normalizedContent = asObject(body.content);
  const attachments = await normalizeAttachmentsForOutbox({
    tenant_id: tenantId,
    attachments: asArray(body.attachments),
    content: normalizedContent,
  });

  if (attachments.length > 0) normalizedContent.attachments = attachments;

  const bodyText = asText(body.body_text) || asText(body.body) || asText(body.text);
  if (!bodyText && attachments.length === 0) throw new Error('Missing body_text or attachments');

  const toAddressOverride = asText(body.to_address) || asText(body.to) || asText(body.recipient_id) || null;
  const preference = asText(body.channel_preference) || asText(body.provider) || null;

  const route = await resolveBestIdentityForQueue({
    supabaseAdmin,
    tenant_id: tenantId,
    contact_id: contactId,
    conversation_id: conversationId,
    preferred_provider: preferredProvider,
    channel_preference: preference,
    to_address: toAddressOverride,
    identity_id: asText(body.identity_id) || null,
  });

  if (!route?.ok) {
    throw new Error(route?.reason || 'no_send_route_found');
  }

  const provider = lower(route.provider);
  const idempotencyKey = computeIdempotencyKey({
    tenant_id: tenantId,
    contact_id: route.contact_id || contactId,
    provider,
    body_text: bodyText,
    attachments,
    clientKey: body.idempotency_key || body.client_request_id,
  });

  const effectiveContent = {
    ...normalizedContent,
    send_route: {
      selected_provider: provider,
      selected_channel_account_id: route.channel_account_id || null,
      fallback_used: Boolean(route.fallback_used),
      source: route.source || null,
    },
  };

  return {
    tenant_id: tenantId,
    contact_id: route.contact_id || contactId,
    conversation_id: conversationId,
    provider,
    channel_account_id: route.channel_account_id || null,
    identity_id: route.identity_id ? String(route.identity_id) : (asText(body.identity_id) || null),
    idempotency_key: idempotencyKey,
    body_text: bodyText,
    body: bodyText,
    attachments,
    content: effectiveContent,
    status: 'queued',
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    created_by: asText(body.created_by),
    updated_at: new Date().toISOString(),
    client_request_id: asText(body.client_request_id) || idempotencyKey,
    to_address: asText(route.to_address) || toAddressOverride,
    from_address: asText(route.from_address) || asText(body.from_address) || null,
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
  const messagesSendGuard = requireTenantPermission({
    supabaseAdmin,
    permission: 'messages.send',
  });

  const outboxRunGuard = requireTenantPermission({
    supabaseAdmin,
    permission: 'outbox.run',
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

    await outboxRunGuard(req, reply);
    if (reply.sent) return undefined;

    const scopedTenantId = asText(req.tenant?.id);
    if (scopedTenantId && scopedTenantId !== tenantId) {
      return reply.code(403).send({ ok: false, error: 'tenant_scope_mismatch' });
    }

    req.auth_mode = 'user';
    return undefined;
  }

  fastify.post('/messages/send', {
    preHandler: [requireApiKeyPreHandler, messagesSendGuard],
    config: { rateLimit: ADMIN_RATE_LIMIT },
  }, async (req, reply) => {
    const body = req.body || {};
    const missing = missingField(body, ['tenant_id']);
    if (missing) {
      return reply.code(400).send({ ok: false, error: `Missing ${missing}` });
    }

    const hasBody = Boolean(asText(body.body_text) || asText(body.body) || asText(body.text));
    const hasAttachments = asArray(body.attachments).length > 0 || asArray(asObject(body.content).attachments).length > 0;
    if (!hasBody && !hasAttachments) {
      return reply.code(400).send({ ok: false, error: 'Missing body_text/text or attachments' });
    }

    if (!asText(body.contact_id) && !asText(body.conversation_id)) {
      return reply.code(400).send({ ok: false, error: 'Missing contact_id or conversation_id' });
    }

    if (ENV.SAFE_MODE) {
      return reply.code(503).send({ ok: false, error: 'safe_mode_enabled', message: 'Outbound sending is disabled while SAFE_MODE=true' });
    }

    try {
      const limitCheck = await checkLimit({
        supabaseAdmin,
        tenant_id: body.tenant_id || req.tenant?.id,
        metric: 'messages_sent_per_month',
        projected_increment: 1,
      });

      if (!limitCheck.allowed) {
        return reply.code(402).send({
          ok: false,
          error: 'limit_exceeded',
          metric: limitCheck.metric,
          limit: limitCheck.limit,
          used: limitCheck.used,
        });
      }

      const outboxInput = await buildQueueOnlyInput({
        ...body,
        tenant_id: body.tenant_id || req.tenant?.id,
        created_by: req.user?.id,
      });

      const sendPolicy = await evaluatePolicy({
        supabaseAdmin,
        action: 'messages.send',
        context: {
          tenant_id: outboxInput.tenant_id,
          user_id: req.user?.id || null,
          ip: req.ip,
          provider: outboxInput.provider || null,
          message_length: String(outboxInput.body_text || '').length,
          has_attachments: Array.isArray(outboxInput.attachments) && outboxInput.attachments.length > 0,
          attachment_bytes: 0,
        },
      });

      if (!sendPolicy.allowed) {
        return reply.code(403).send({
          ok: false,
          error: 'policy_denied',
          reason: sendPolicy.reason,
          policy_id: sendPolicy.policy?.id || null,
        });
      }

      const { outboxRow, deduped } = await queueWithIdempotency(outboxInput);

      await logAudit({
        tenant_id: outboxRow.tenant_id,
        actor_user_id: req.user?.id || null,
        actor_type: 'user',
        action: 'send_message_queued',
        entity_type: 'outbox_message',
        entity_id: String(outboxRow.id),
        metadata: {
          provider: outboxRow.provider,
          channel_account_id: outboxRow.channel_account_id || null,
          deduped,
        },
      }).catch(() => {});

      return reply.send({
        ok: true,
        outbox_id: outboxRow.id,
        status: outboxRow.status,
        deduped,
        provider: outboxRow.provider,
        channel_account_id: outboxRow.channel_account_id || null,
        to_address: outboxRow.to_address || null,
        from_address: outboxRow.from_address || null,
        idempotency_key: outboxRow.idempotency_key || null,
        warning: limitCheck.warning ? limitCheck.warning_message : null,
      });
    } catch (error) {
      return reply.code(400).send({ ok: false, error: String(error?.message || error) });
    }
  });

  fastify.post('/send/outbox', async (req, reply) => {
    if (!requireApiKey(req, reply)) return;

    const body = req.body || {};
    if (ENV.SAFE_MODE) {
      return reply.code(503).send({ ok: false, error: 'safe_mode_enabled', message: 'Outbound sending is disabled while SAFE_MODE=true' });
    }

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

    if (ENV.SAFE_MODE) {
      return reply.code(503).send({ ok: false, error: 'safe_mode_enabled', message: 'Outbound processing is disabled while SAFE_MODE=true', tenant_id: tenantId });
    }

    const runPolicy = await evaluatePolicy({
      supabaseAdmin,
      action: 'outbox.run',
      context: {
        tenant_id: tenantId,
        user_id: req.user?.id || null,
        ip: req.ip,
      },
    });

    if (!runPolicy.allowed) {
      return reply.code(403).send({
        ok: false,
        error: 'policy_denied',
        reason: runPolicy.reason,
        policy_id: runPolicy.policy?.id || null,
      });
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

      await logAudit({
        tenant_id: tenantId,
        actor_user_id: req.user?.id || null,
        actor_type: req.auth_mode === 'cron' ? 'system' : 'user',
        action: 'outbox_run',
        entity_type: 'outbox',
        entity_id: tenantId,
        metadata: {
          limit,
          processed: result.processed,
          sent: result.sent,
          failed: result.failed,
          auth_mode: req.auth_mode || 'unknown',
        },
      }).catch(() => {});

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

    if (ENV.SAFE_MODE) {
      return reply.code(503).send({ ok: false, error: 'safe_mode_enabled', message: 'Outbound processing is disabled while SAFE_MODE=true', tenant_id: tenantId || null });
    }

    try {
      const result = await runOutboxBatch({ tenantId, limit });
      return reply.send({ ok: true, tenant_id: tenantId || null, ...result });
    } catch (error) {
      return reply.code(500).send({ ok: false, error: String(error?.message || error) });
    }
  });
}
