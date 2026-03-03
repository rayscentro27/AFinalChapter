import { ENV } from '../env.js';
import { AI_GATEWAY_CONFIG } from '../config/aiGatewayConfig.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

export async function aiGatewayRoutes(fastify) {
  fastify.post('/api/ai/execute', {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
      },
    },
  }, async (req, reply) => {
    const apiKey = asText(req.headers['x-api-key']);
    if (!apiKey || apiKey !== ENV.INTERNAL_API_KEY) {
      return reply.code(401).send({ ok: false, error: 'unauthorized' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};

    // Do not echo secrets or full request payloads.
    return reply.send({
      ok: true,
      status: 'stub',
      message: 'AI gateway foundation route is live. Provider execution is not enabled in this stub.',
      request_id: req.id,
      providers_configured: {
        gemini: Boolean(AI_GATEWAY_CONFIG.GEMINI_API_KEY),
        openrouter: Boolean(AI_GATEWAY_CONFIG.OPENROUTER_API_KEY),
        nvidia_nim: Boolean(AI_GATEWAY_CONFIG.NVIDIA_NIM_API_KEY),
        enable_nim_dev: AI_GATEWAY_CONFIG.ENABLE_NIM_DEV,
      },
      input_meta: {
        has_prompt: typeof body.prompt === 'string' && body.prompt.trim().length > 0,
        model: asText(body.model) || null,
      },
      educational_only: true,
      no_guarantees: true,
    });
  });
}
