import { ENV } from '../env.js';
import { verifyMatrixWebhookToken } from '../lib/webhooks/matrix-signature.js';
import { extractMatrixExternalEventId } from '../lib/webhooks/external-event-id.js';
import { acceptWebhookEvent } from '../lib/webhooks/idempotency.js';
import { storeProviderEvent } from '../util/provider-events.js';
import { WEBHOOK_RATE_LIMIT } from '../util/rate-limit.js';
import { getSourceIp } from '../util/request.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

export async function matrixRoutes(fastify) {
  fastify.post('/webhooks/matrix', {
    config: { rateLimit: WEBHOOK_RATE_LIMIT },
  }, async (req, reply) => {
    if (!verifyMatrixWebhookToken({ headers: req.headers, token: ENV.MATRIX_WEBHOOK_TOKEN })) {
      return reply.code(401).send({ ok: false, error: 'Invalid Matrix webhook token' });
    }

    const payload = req.body || {};
    const tenantId = asText(payload?.tenant_id) || null;
    const externalEventId = extractMatrixExternalEventId(payload, req.rawBody || JSON.stringify(payload));

    const idempotency = await acceptWebhookEvent({
      tenantId,
      provider: 'matrix',
      externalEventId,
      payload,
    });

    if (idempotency.ignored) {
      return reply.code(200).send({ ok: true, ignored: true });
    }

    await storeProviderEvent({
      tenant_id: tenantId,
      provider: 'matrix',
      provider_event_id: externalEventId,
      channel_external_id: asText(payload?.room_id) || null,
      event_type: 'matrix_webhook',
      payload,
      normalized: {
        event_id: asText(payload?.event_id) || null,
        room_id: asText(payload?.room_id) || null,
        sender: asText(payload?.sender) || null,
      },
      signature_valid: true,
      source_ip: getSourceIp(req),
      received_at: new Date().toISOString(),
    });

    // TODO: Wire Matrix inbound parsing once Matrix send/receive adapter is enabled.
    return reply.code(200).send({ ok: true, processed: 0 });
  });
}
