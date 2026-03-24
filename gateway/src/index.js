import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';

import { ENV } from './env.js';
import { isOriginAllowed } from './config/aiGatewayConfig.js';
import { validateGatewayEnv } from './config/envValidation.js';
import { healthRoutes } from './routes/health.js';
import { aiGatewayRoutes } from './routes/ai_gateway.js';
import { metaRoutes } from './routes/meta.js';
import { matrixRoutes } from './routes/matrix.js';
import { telegramRoutes } from './routes/telegram.js';
import { sendRoutes } from './routes/send.js';
import { routingRoutes } from './routes/routing.js';
import { outboxRoutes } from './routes/outbox.js';
import { adminContactRoutes } from './routes/admin_contacts.js';
import { adminHardeningRoutes } from './routes/admin_hardening.js';
import { adminMonitoringRoutes } from './routes/admin_monitoring.js';
import { adminMonitoringV2Routes } from './routes/admin_monitoring_v2.js';
import { attachmentsRoutes } from './routes/attachments.js';
import { assignmentRoutes } from './routes/assignment.js';
import { aiWorkflowRoutes } from './routes/ai_workflow.js';
import { platformMaturityRoutes } from './routes/platform_maturity.js';
import { adminSreRoutes } from './routes/admin_sre.js';
import { enterpriseRoutes } from './routes/enterprise.js';
import { tradingviewRoutes } from './routes/tradingview.js';
import { researchRoutes } from './routes/research.js';
import { systemHealthRoutes } from './routes/system_health.js';
import { adminMembershipRoutes } from './routes/admin_membership.js';
import { controlPlaneRoutes } from './routes/control_plane.js';
import { adminCommandRoutes } from './routes/admin_commands.js';
import { adminCredentialRoutes } from './routes/admin_credentials.js';
import { recordRequestMetric } from './lib/observability/requestMetrics.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function requestTenantId(req) {
  return (
    asText(req?.tenant?.id)
    || asText(req?.body?.tenant_id)
    || asText(req?.query?.tenant_id)
    || asText(req?.params?.tenant_id)
    || null
  );
}

function requestProvider(req) {
  const path = asText(req?.routeOptions?.url || req?.routerPath || req?.raw?.url).toLowerCase();
  if (path.includes('/webhooks/meta')) return 'meta';
  if (path.includes('/webhooks/matrix')) return 'matrix';
  if (path.includes('/webhooks/telegram')) return 'telegram';
  if (path.includes('/webhooks/tradingview')) return 'tradingview';
  return null;
}


function resolveTrustProxyOption() {
  if (!ENV.TRUST_PROXY) return false;
  if (Array.isArray(ENV.TRUST_PROXY_CIDRS) && ENV.TRUST_PROXY_CIDRS.length > 0) {
    return ENV.TRUST_PROXY_CIDRS;
  }
  if (ENV.TRUST_PROXY_ALLOW_ALL) {
    return true;
  }
  return false;
}

const trustProxyOption = resolveTrustProxyOption();
if (ENV.TRUST_PROXY && trustProxyOption === false) {
  console.warn('[gateway] TRUST_PROXY enabled but no TRUST_PROXY_CIDRS configured and TRUST_PROXY_ALLOW_ALL=false; disabling trust proxy for safety');
}

const fastify = Fastify({
  logger: {
    level: ENV.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.Authorization',
        'req.headers.x-api-key',
        'headers.authorization',
        'headers.Authorization',
        'headers.x-api-key',
        'authorization',
        'x-api-key',
        'access_token',
        'app_secret',
        'service_role_key',
        'supabase_service_role_key',
        'gemini_api_key',
        'openrouter_api_key',
        'nvidia_nim_api_key',
        'tradingview_webhook_secret',
        'oanda_api_key',
        'telegram_bot_token',
        'req.body.secret',
        'body.secret',
      ],
      censor: '[REDACTED]',
    },
  },
  trustProxy: trustProxyOption,
  bodyLimit: 2 * 1024 * 1024,
});

const envValidation = validateGatewayEnv({
  env: process.env,
  strict: ENV.ENV_VALIDATE_STRICT,
  logger: fastify.log,
});

if (!envValidation.ok) {
  fastify.log.warn({ env_validation: envValidation }, 'gateway_env_validation_incomplete');
}

// Capture raw JSON body for signature hashing while preserving parsed JSON body.
fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  req.rawBody = body?.toString('utf8') || '';
  try {
    done(null, JSON.parse(req.rawBody || '{}'));
  } catch (error) {
    done(error);
  }
});

fastify.addHook('onRequest', async (req) => {
  req._startTimeNs = process.hrtime.bigint();
});

fastify.addHook('onResponse', async (req, reply) => {
  const startedAt = typeof req._startTimeNs === 'bigint' ? req._startTimeNs : process.hrtime.bigint();
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  const route = asText(req?.routeOptions?.url || req?.routerPath || req?.raw?.url);
  const tenantId = requestTenantId(req);
  const provider = requestProvider(req);

  recordRequestMetric({
    route,
    method: req.method,
    tenant_id: tenantId,
    provider,
    status_code: reply.statusCode,
    ms: elapsedMs,
  });

  req.log.info({
    request_id: req.id,
    tenant_id: tenantId,
    user_id: asText(req?.user?.id) || null,
    route,
    provider,
    status_code: reply.statusCode,
    ms: Number(elapsedMs.toFixed(2)),
  }, 'request_completed');
});

await fastify.register(cors, {
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) {
      cb(null, true);
      return;
    }
    cb(new Error('Origin not allowed by CORS policy'), false);
  },
  credentials: true,
});
await fastify.register(helmet);
await fastify.register(rateLimit, {
  max: 600,
  timeWindow: '1 minute',
});
await fastify.register(formbody);
await fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

await fastify.register(healthRoutes);
await fastify.register(systemHealthRoutes);
await fastify.register(aiGatewayRoutes);
await fastify.register(metaRoutes);
await fastify.register(matrixRoutes);
await fastify.register(telegramRoutes);
await fastify.register(tradingviewRoutes);
await fastify.register(sendRoutes);
await fastify.register(outboxRoutes);
await fastify.register(routingRoutes);
await fastify.register(adminContactRoutes);
await fastify.register(adminHardeningRoutes);
await fastify.register(adminMonitoringRoutes);
await fastify.register(adminMonitoringV2Routes);
await fastify.register(attachmentsRoutes);
await fastify.register(assignmentRoutes);
await fastify.register(aiWorkflowRoutes);
await fastify.register(platformMaturityRoutes);
await fastify.register(adminSreRoutes);
await fastify.register(enterpriseRoutes);
await fastify.register(researchRoutes);
await fastify.register(adminMembershipRoutes);
await fastify.register(controlPlaneRoutes);
await fastify.register(adminCommandRoutes);
await fastify.register(adminCredentialRoutes);

fastify.setErrorHandler((error, req, reply) => {
  req.log.error({
    request_id: req.id,
    tenant_id: requestTenantId(req),
    user_id: asText(req?.user?.id) || null,
    route: asText(req?.routeOptions?.url || req?.routerPath || req?.raw?.url),
    err: {
      message: String(error?.message || 'unknown_error'),
      code: error?.code || null,
      statusCode: Number(error?.statusCode) || null,
    },
  }, 'unhandled_request_error');

  if (!reply.sent) {
    reply.code(500).send({ ok: false, error: 'Internal server error' });
  }
});

try {
  await fastify.listen({ port: ENV.PORT, host: '0.0.0.0' });
} catch (error) {
  fastify.log.error(error);
  process.exit(1);
}
