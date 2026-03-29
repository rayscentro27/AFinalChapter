import crypto from 'node:crypto';

import { ENV } from '../env.js';
import { supabaseAdmin as defaultSupabaseAdmin } from '../supabase.js';
import { WEBHOOK_RATE_LIMIT } from '../util/rate-limit.js';
import { getSourceIp as defaultGetSourceIp } from '../util/request.js';
import { redactSecrets } from '../util/redact.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asNumericOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSide(value) {
  const side = asText(value).toLowerCase();
  if (!side) return null;
  if (side === 'long') return 'buy';
  if (side === 'short') return 'sell';
  if (side === 'buy' || side === 'sell') return side;
  return side;
}

function normalizeSymbol(value) {
  const raw = asText(value).toUpperCase();
  if (!raw) return '';

  const compact = raw.replace(/[^A-Z]/g, '');
  if (compact.length === 6) {
    return `${compact.slice(0, 3)}_${compact.slice(3)}`;
  }

  return raw.replace(/[\-\/]/g, '_');
}

function timingSafeEquals(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));

  if (left.length !== right.length) return false;
  if (left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

async function requireApiKey(req, reply) {
  const key = asText(req.headers['x-api-key']);
  if (!key || key !== ENV.INTERNAL_API_KEY) {
    reply.code(401).send({ ok: false, error: 'unauthorized' });
    return;
  }
  return undefined;
}

export function normalizeTradingViewPayload(payload = {}) {
  const data = asObject(payload);

  const symbol = normalizeSymbol(data.symbol || data.instrument || data.ticker || '');
  const side = normalizeSide(data.side || data.direction || data.action);
  const timeframe = asText(data.timeframe || data.tf);

  const normalized = {
    symbol: symbol || null,
    timeframe: timeframe || null,
    side: side || null,
    strategy_id: asText(data.strategy_id || data.strategy || data.strategyId) || null,
    entry_price: asNumericOrNull(data.entry_price ?? data.entry ?? data.price),
    stop_loss: asNumericOrNull(data.stop_loss ?? data.sl),
    take_profit: asNumericOrNull(data.take_profit ?? data.tp),
    confidence: asNumericOrNull(data.confidence),
    session_label: asText(data.session_label || data.session) || null,
  };

  const valid = Boolean(normalized.symbol && normalized.side);

  return {
    valid,
    normalized,
    errors: [
      !normalized.symbol ? 'missing_symbol' : null,
      !normalized.side ? 'missing_side' : null,
    ].filter(Boolean),
  };
}

export async function tradingviewRoutes(fastify, { deps = {} } = {}) {
  const supabaseAdmin = deps.supabaseAdmin || defaultSupabaseAdmin;
  const getSourceIp = deps.getSourceIp || defaultGetSourceIp;

  fastify.post('/api/webhooks/tradingview', {
    config: { rateLimit: WEBHOOK_RATE_LIMIT },
  }, async (req, reply) => {
    const traceId = asText(req.id || crypto.randomUUID());
    const receivedAt = new Date().toISOString();
    const payload = asObject(req.body);
    const sanitizedPayload = { ...payload };
    if (Object.prototype.hasOwnProperty.call(sanitizedPayload, 'secret')) {
      delete sanitizedPayload.secret;
    }
    const headers = redactSecrets(asObject(req.headers));
    const sourceIp = getSourceIp(req);

    const providedSecret = asText(payload.secret);
    const expectedSecret = asText(ENV.TRADINGVIEW_WEBHOOK_SECRET);
    const secretValid = expectedSecret ? timingSafeEquals(providedSecret, expectedSecret) : false;

    const rawInsert = await supabaseAdmin
      .from('tv_raw_alerts')
      .insert({
        source: 'tradingview',
        ip: sourceIp,
        headers,
        payload: sanitizedPayload,
        secret_valid: secretValid,
        trace_id: traceId,
        status: secretValid ? 'received' : 'rejected_invalid_secret',
      })
      .select('id')
      .single();

    if (rawInsert.error) {
      req.log.error({ request_id: traceId, err: { message: rawInsert.error.message } }, 'tradingview_raw_insert_failed');
      return reply.code(500).send({ ok: false, received: false, trace_id: traceId, normalized: false });
    }

    if (!secretValid) {
      return reply.code(401).send({ ok: false, received: true, trace_id: traceId, normalized: false });
    }

    const rawAlertId = rawInsert.data?.id || null;
    const parsed = normalizeTradingViewPayload(payload);

    if (!parsed.valid) {
      const rawUpdate = await supabaseAdmin
        .from('tv_raw_alerts')
        .update({
          status: 'received_not_normalized',
        })
        .eq('id', rawAlertId);

      if (rawUpdate.error) {
        req.log.warn({ request_id: traceId, err: { message: rawUpdate.error.message } }, 'tradingview_raw_status_update_failed');
      }

      return reply.code(200).send({ ok: true, received: true, trace_id: traceId, normalized: false });
    }

    const normalizedInsert = await supabaseAdmin
      .from('tv_normalized_signals')
      .insert({
        raw_alert_id: rawAlertId,
        symbol: parsed.normalized.symbol,
        timeframe: parsed.normalized.timeframe,
        side: parsed.normalized.side,
        strategy_id: parsed.normalized.strategy_id,
        entry_price: parsed.normalized.entry_price,
        stop_loss: parsed.normalized.stop_loss,
        take_profit: parsed.normalized.take_profit,
        confidence: parsed.normalized.confidence,
        session_label: parsed.normalized.session_label,
        source: 'tradingview',
        trace_id: traceId,
        meta: {
          received_at: receivedAt,
          normalize_errors: parsed.errors,
          signal_only: true,
          execution_disabled: true,
        },
        status: 'new',
      })
      .select('id')
      .single();

    if (normalizedInsert.error) {
      req.log.error({ request_id: traceId, err: { message: normalizedInsert.error.message } }, 'tradingview_normalized_insert_failed');
      return reply.code(200).send({ ok: true, received: true, trace_id: traceId, normalized: false });
    }

    const signalId = normalizedInsert.data?.id || null;

    const jobInsert = await supabaseAdmin
      .from('signal_enrichment_jobs')
      .insert({
        signal_id: signalId,
        status: 'queued',
        note: 'queued by webhook',
        trace_id: traceId,
        raw: {
          source: 'tradingview_webhook',
          signal_only: true,
          execution_disabled: true,
        },
      });

    if (jobInsert.error) {
      req.log.warn({ request_id: traceId, err: { message: jobInsert.error.message } }, 'tradingview_job_insert_failed');
    }

    return reply.code(200).send({
      ok: true,
      received: true,
      trace_id: traceId,
      normalized: true,
    });
  });

  fastify.get('/api/webhooks/tradingview/health', {
    preHandler: [requireApiKey],
  }, async () => {
    return {
      ok: true,
      service: 'tradingview_webhook_intake',
      ts: new Date().toISOString(),
      configured: {
        tradingview_secret: Boolean(asText(ENV.TRADINGVIEW_WEBHOOK_SECRET)),
        supabase: Boolean(asText(ENV.SUPABASE_URL) && asText(ENV.SUPABASE_SERVICE_ROLE_KEY)),
        oanda_market_data: Boolean(asText(ENV.OANDA_API_KEY) && asText(ENV.OANDA_ACCOUNT_ID)),
        telegram_alerts: Boolean(asText(ENV.TELEGRAM_BOT_TOKEN) && asText(ENV.TELEGRAM_CHAT_ID)),
      },
      safety: {
        live_trading_enabled: false,
        oanda_mode: 'market_data_only',
      },
    };
  });
}
