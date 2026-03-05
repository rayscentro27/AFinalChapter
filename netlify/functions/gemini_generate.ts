import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { requireAuthenticatedUser } from './_shared/staff_auth';
import { getPromptMeta } from './_shared/prompt_library';
import { routeModel, type RiskClass } from './_shared/model_router';
import {
  budgetForRisk,
  compressContents,
  estimateTokens,
  withRetry,
  withTimeout,
  sanitizeForSummary,
} from './_shared/ai_guardrails';

const BodySchema = z.object({
  model: z.string().min(1).optional(),
  // The @google/genai SDK accepts either a string or an array of multimodal parts.
  contents: z.any(),
  config: z.any().optional(),

  // Prompt library reference (server side).
  prompt_id: z.string().min(1).optional(),

  // Deterministic routing controls.
  task_type: z.string().optional(),
  risk_class: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),

  // Tenant scope for cache isolation.
  tenant_id: z.string().uuid().optional(),

  // Optional: let caller group cache entries by feature.
  cache_namespace: z.string().optional().default('gemini_generate'),
});

type CachedResponse = {
  text: string;
  candidates?: any;
  cached?: boolean;
  model?: string;
  tenant_id?: string;
  compressed?: boolean;
  trace?: {
    prompt_id?: string | null;
    task_type?: string | null;
    risk_class?: string;
  };
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const actor = await requireAuthenticatedUser(event);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiApiKey = process.env.API_KEY;

    if (!supabaseUrl) throw new Error('Missing SUPABASE_URL');
    if (!supabaseServiceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    if (!geminiApiKey) throw new Error('Missing API_KEY (Gemini)');

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const tenantId = await resolveTenantIdForUser(supabase, actor.userId, body.tenant_id || null);

    const promptMeta = body.prompt_id ? getPromptMeta(body.prompt_id) : null;
    const taskType = body.task_type || promptMeta?.taskType || 'general';
    const riskClass = (body.risk_class || promptMeta?.riskClass || 'medium') as RiskClass;

    const model = routeModel({
      taskType,
      riskClass,
      requestedModel: body.model || null,
    });

    const mergedConfig = mergeConfig(body.config, promptMeta?.text || null);

    const maxContextChars = safeInt(process.env.AI_MAX_CONTEXT_CHARS, 12000);
    const compressed = compressContents(body.contents, maxContextChars);

    const estimatedTokens = estimateTokens({ model, contents: compressed.contents, config: mergedConfig });
    const requestBudget = budgetForRisk(riskClass, process.env);
    if (estimatedTokens > requestBudget) {
      const err: any = new Error(`Token budget exceeded for risk=${riskClass}: estimated=${estimatedTokens}, budget=${requestBudget}`);
      err.statusCode = 413;
      throw err;
    }

    const ttlHours = safeInt(process.env.AGENT_CACHE_TTL_HOURS, 72);

    const cacheKey = sha256(
      JSON.stringify({
        ns: body.cache_namespace,
        tenant_id: tenantId,
        user_id: actor.userId,
        prompt_id: body.prompt_id || null,
        task_type: taskType,
        risk_class: riskClass,
        model,
        contents: compressed.contents,
        config: mergedConfig,
      })
    );

    // Cache lookup
    const { data: hit, error: hitErr } = await supabase
      .from('agent_cache')
      .select('response, created_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (hitErr) {
      console.warn('agent_cache lookup failed:', hitErr.message);
    }

    if (hit?.response) {
      const createdAt = hit.created_at ? new Date(hit.created_at) : null;
      const fresh = createdAt ? Date.now() - createdAt.getTime() < ttlHours * 3600_000 : false;

      if (fresh) {
        return json(200, { ...(hit.response as any), cached: true } satisfies CachedResponse);
      }
    }

    // Cache miss: call Gemini with timeout + retry/backoff.
    const timeoutMs = safeInt(process.env.AI_REQUEST_TIMEOUT_MS, 20000);
    const retries = safeInt(process.env.AI_REQUEST_RETRIES, 2);

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const resp = await withRetry(
      () =>
        withTimeout(
          () =>
            ai.models.generateContent({
              model,
              contents: compressed.contents,
              config: mergedConfig,
            } as any),
          timeoutMs
        ),
      { retries, baseDelayMs: 250 }
    );

    const payload: CachedResponse = {
      text: resp.text || '',
      candidates: (resp as any).candidates,
      cached: false,
      model,
      tenant_id: tenantId,
      compressed: compressed.compressed,
      trace: {
        prompt_id: body.prompt_id || null,
        task_type: taskType,
        risk_class: riskClass,
      },
    };

    // Cache store (best-effort)
    const insertRes = await supabase.from('agent_cache').insert({
      cache_key: cacheKey,
      employee: `gemini:${model}`,
      user_message: summarizeForStorage(compressed.summary || summarizeUserMessage(compressed.contents)),
      context_hash: sha256(JSON.stringify({ config: mergedConfig, taskType, riskClass, prompt_id: body.prompt_id || null })),
      response: payload,
    });

    if (insertRes.error) {
      if (!String(insertRes.error.code || '').includes('23505')) {
        console.warn('agent_cache insert failed:', insertRes.error.message);
      }
    }

    return json(200, payload);
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function mergeConfig(base: any, promptText: string | null) {
  const cfg = base && typeof base === 'object' ? { ...base } : {};
  if (!promptText) return cfg;

  const prior = typeof cfg.systemInstruction === 'string' ? cfg.systemInstruction.trim() : '';
  cfg.systemInstruction = prior ? `${promptText}\n\n${prior}` : promptText;
  return cfg;
}

async function resolveTenantIdForUser(
  supabase: any,
  userId: string,
  requestedTenantId: string | null
): Promise<string> {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('user_id', userId);

  if (error) {
    const err: any = new Error(`Failed to resolve tenant membership: ${error.message}`);
    err.statusCode = 400;
    throw err;
  }

  const ids: string[] = Array.from(new Set((data || []).map((r: any) => String(r?.tenant_id || '')).filter(Boolean))); 
  if (ids.length === 0) {
    const err: any = new Error('No tenant membership found for user');
    err.statusCode = 403;
    throw err;
  }

  if (requestedTenantId) {
    if (!ids.includes(requestedTenantId)) {
      const err: any = new Error('Requested tenant_id is not accessible for this user');
      err.statusCode = 403;
      throw err;
    }
    return requestedTenantId;
  }

  if (ids.length === 1) return ids[0];

  const err: any = new Error('Multiple tenant memberships found; provide tenant_id');
  err.statusCode = 400;
  throw err;
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function sha256(s: string) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function safeInt(v: any, fallback: number) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function summarizeUserMessage(contents: any) {
  try {
    const s = typeof contents === 'string' ? contents : JSON.stringify(contents);
    return s.slice(0, 4000);
  } catch {
    return '[unserializable contents]';
  }
}

function summarizeForStorage(text: string) {
  return sanitizeForSummary(String(text || '')).slice(0, 4000);
}
