import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { acceptWebhookEvent } from '../lib/webhooks/idempotency.js';
import { extractTelegramExternalEventId } from '../lib/webhooks/external-event-id.js';
import { WEBHOOK_RATE_LIMIT } from '../util/rate-limit.js';
import { getSourceIp } from '../util/request.js';
import { createAdminCommand, commandResponseRow } from './admin_commands.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function lower(value) {
  return asText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function webhookTokenValid(headers) {
  const configured = asText(ENV.TELEGRAM_WEBHOOK_SECRET);
  if (!configured) return false;
  const provided = asText(headers?.['x-telegram-bot-api-secret-token']);
  return Boolean(provided && provided === configured);
}

function extractTelegramMessage(payload) {
  return payload?.message || payload?.edited_message || payload?.channel_post || payload?.edited_channel_post || null;
}

function extractCommandText(message) {
  const raw = asText(message?.text || message?.caption);
  if (!raw) return '';
  if (lower(raw).startsWith('/nexus ')) return raw.slice(7).trim();
  if (lower(raw).startsWith('/command ')) return raw.slice(9).trim();
  return raw;
}

async function resolveTenantByTelegramChat(chatId) {
  const { data, error } = await supabaseAdmin
    .from('notification_channels')
    .select('tenant_id,id,kind,destination,is_active')
    .in('kind', ['telegram', 'telegram_chat'])
    .eq('destination', chatId)
    .eq('is_active', true)
    .limit(2);

  if (error) {
    throw new Error(`notification_channels lookup failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    const err = new Error('ambiguous_telegram_chat_mapping');
    err.statusCode = 409;
    throw err;
  }

  return asText(rows[0].tenant_id) || null;
}

export async function telegramRoutes(fastify) {
  fastify.post('/api/webhooks/telegram', {
    config: { rateLimit: WEBHOOK_RATE_LIMIT },
  }, async (req, reply) => {
    if (!webhookTokenValid(req.headers)) {
      return reply.code(401).send({ ok: false, error: 'invalid_telegram_webhook_secret' });
    }

    const payload = asObject(req.body);
    const message = extractTelegramMessage(payload);
    const chatId = asText(message?.chat?.id);
    const commandText = extractCommandText(message);
    const externalEventId = extractTelegramExternalEventId(payload, req.rawBody || JSON.stringify(payload));

    if (!chatId) {
      return reply.code(400).send({ ok: false, error: 'missing_telegram_chat_id' });
    }

    const tenantId = await resolveTenantByTelegramChat(chatId);
    if (!tenantId) {
      return reply.code(404).send({ ok: false, error: 'telegram_chat_not_mapped_to_tenant' });
    }

    const idempotency = await acceptWebhookEvent({
      tenantId,
      provider: 'telegram',
      externalEventId,
      payload,
    });

    if (idempotency.ignored) {
      return reply.code(200).send({ ok: true, ignored: true });
    }

    if (!commandText) {
      return reply.code(200).send({ ok: true, ignored: true, reason: 'no_command_text' });
    }

    const created = await createAdminCommand({
      actor: { user_id: null, role: 'telegram_bot' },
      tenantId,
      commandText,
      requestIp: getSourceIp(req),
      source: 'telegram_webhook',
      chatId,
      logger: req.log,
      metadata: {
        telegram_update_id: payload?.update_id || null,
        telegram_message_id: message?.message_id || null,
        telegram_chat_id: chatId,
        telegram_chat_type: asText(message?.chat?.type) || null,
        telegram_from_id: asText(message?.from?.id) || null,
        telegram_from_username: asText(message?.from?.username) || null,
      },
    });

    if (created.queue_handoff_failed) {
      return reply.code(503).send({
        ok: false,
        error: 'queue_handoff_failed',
        acknowledgment: created.acknowledgment,
        submitted: commandResponseRow(created.submitted),
      });
    }

    return reply.code(200).send({
      ok: true,
      acknowledgment: created.acknowledgment,
      submitted: commandResponseRow(created.submitted),
    });
  });
}