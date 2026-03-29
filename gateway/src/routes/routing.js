import { ENV } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { runRouting } from '../util/route-conversation.js';
import { requireTenantPermission } from '../lib/auth/requireTenantPermission.js';
import { evaluatePolicy } from '../lib/policy/policyEngine.js';

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

export async function routingRoutes(fastify) {
  const routingManageGuard = requireTenantPermission({
    supabaseAdmin,
    permission: 'routing.manage',
  });

  fastify.post('/routing/run', {
    preHandler: [requireApiKeyPreHandler, routingManageGuard],
  }, async (req, reply) => {
    const { tenant_id, conversation_id, dry_run, force } = req.body || {};
    if (!tenant_id || !conversation_id) {
      return reply.code(400).send({ ok: false, error: 'Missing tenant_id, conversation_id' });
    }

    const policy = await evaluatePolicy({
      supabaseAdmin,
      action: 'routing.manage',
      context: {
        tenant_id,
        user_id: req.user?.id || null,
        ip: req.ip,
      },
    });

    if (!policy.allowed) {
      return reply.code(403).send({
        ok: false,
        error: 'policy_denied',
        reason: policy.reason,
        policy_id: policy.policy?.id || null,
      });
    }

    const result = await runRouting({
      tenant_id,
      conversation_id,
      dry_run: Boolean(dry_run),
      force: Boolean(force),
    });

    return reply.code(result.statusCode || 200).send({
      ...result,
      statusCode: undefined,
    });
  });
}
