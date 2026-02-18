import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { classifyDrift, type DriftSeverity } from './_shared/drift';

const GLOBAL_GUARDRAILS = `
ESCALATION & HUMAN OVERRIDE:
- Escalate to human review if the user requests deception, document manipulation, bypassing underwriting, guaranteed approvals, or guaranteed deletions.
- If the user requests legal/tax advice beyond educational explanations, escalate.

CONSTRAINT STAMP (mandatory):
- No guarantees of approvals, funding, deletions, awards, or timelines.
- No legal/tax/regulated advice framing; recommend professional review when needed.
- No deception or bypassing underwriting/compliance.
`;

const BodySchema = z.object({
  // Back-compat: single employee call.
  employee: z.string().min(1).optional(),

  // New: run multiple employees then arbitrate.
  employees: z.array(z.string().min(1)).min(1).optional(),
  arbitrate: z.coerce.boolean().optional().default(false),

  user_message: z.string().min(1),
  context: z.unknown().optional(),
  mode: z.enum(['simulated', 'live']).optional().default('simulated'),

  // Optional: enable supervisor approval mode.
  approval_mode: z.coerce.boolean().optional().default(false),

  // Optional: for drift alert persistence + scoring.
  client_id: z.string().uuid().optional(),

  // Optional: run scoring function + inject scores into context.
  score_inputs: z
    .object({
      has_registered_business: z.boolean(),
      has_ein: z.boolean(),
      has_bank_account: z.boolean(),
      has_domain_email: z.boolean(),
      has_business_phone: z.boolean(),
      has_website: z.boolean(),
      credit_score_est: z.number().int(),
      has_major_derog: z.boolean(),
      utilization_pct: z.number().int(),
      months_reserves: z.number().int(),
      docs_ready: z.boolean(),
    })
    .optional(),
});

type ToolRequest = {
  name: string;
  args: Record<string, unknown>;
  reason: string;
};

type AgentJson = {
  tool_requests: ToolRequest[];
  final_answer: string;
};

const AgentJsonSchemaZ = z.object({
  tool_requests: z
    .array(
      z.object({
        name: z.string().min(1),
        args: z.record(z.string(), z.unknown()).default({}),
        reason: z.string().default(''),
      })
    )
    .default([]),
  final_answer: z.string(),
});

const AgentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tool_requests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          args: { type: 'object' },
          reason: { type: 'string' },
        },
        required: ['name', 'args', 'reason'],
      },
    },
    final_answer: { type: 'string' },
  },
  required: ['tool_requests', 'final_answer'],
} as const;

const SupervisorSchemaZ = z.object({
  approved: z.boolean(),
  reasons: z.array(z.string()).default([]),
  required_edits: z.array(z.string()).default([]),
  risk_level: z.enum(['low', 'moderate', 'high', 'critical']),
});

type SupervisorOut = z.infer<typeof SupervisorSchemaZ>;

const SupervisorSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    approved: { type: 'boolean' },
    reasons: { type: 'array', items: { type: 'string' } },
    required_edits: { type: 'array', items: { type: 'string' } },
    risk_level: { type: 'string', enum: ['low', 'moderate', 'high', 'critical'] },
  },
  required: ['approved', 'reasons', 'required_edits', 'risk_level'],
} as const;

const CACHE_TTL_MS = (() => {
  const hours = Number(process.env.AGENT_CACHE_TTL_HOURS || '72');
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.floor(hours * 60 * 60 * 1000);
})();

function norm(s: string) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 800);
}

function sha256(s: string) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function stableStringify(x: any): string {
  if (x === null || x === undefined) return String(x);
  if (typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(stableStringify).join(',') + ']';

  const obj = x as Record<string, any>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

async function cacheLookup(supabase: any, cacheKey: string) {
  try {
    const { data, error } = await supabase
      .from('agent_cache')
      .select('response, created_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (error) return null;
    if (!data?.response) return null;

    if (CACHE_TTL_MS > 0 && data.created_at) {
      const cutoff = Date.now() - CACHE_TTL_MS;
      const ts = Date.parse(String(data.created_at));
      if (Number.isFinite(ts) && ts < cutoff) return null;
    }

    return data.response;
  } catch {
    return null;
  }
}

async function cacheStore(
  supabase: any,
  row: {
    cache_key: string;
    employee: string;
    user_message: string;
    context_hash: string;
    response: any;
  }
) {
  try {
    await supabase.from('agent_cache').upsert({
      cache_key: row.cache_key,
      employee: row.employee,
      user_message: row.user_message,
      context_hash: row.context_hash,
      response: row.response,
    });
  } catch {
    // ignore
  }
}

async function persistDrift(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  severity: Exclude<DriftSeverity, 'none'>,
  category: string,
  message: string
) {
  try {
    await supabase.from('drift_alerts').insert({ client_id: clientId, severity, category, message });
  } catch {
    // ignore
  }
  try {
    await supabase.from('audit_logs').insert({
      tenant_id: clientId,
      action: 'drift_alert',
      entity_type: 'tenant',
      entity_id: clientId,
      meta: { severity, category, message },
    });
  } catch {
    // ignore
  }
}

function safeHumanReviewAnswer(reason: string) {
  return (
    `This requires human review to stay accurate and compliant.\n\n` +
    `Reason: ${reason}\n\n` +
    `Safe next steps:\n` +
    `1) Share what you are trying to achieve and your timeline constraints.\n` +
    `2) Provide the relevant documents/data (no sensitive data beyond what is needed).\n` +
    `3) If this involves disputes, approvals, or regulated topics, we will use educational framing and recommend professional review when needed.\n\n` +
    `No guarantees are possible.`
  );
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(500, { error: 'Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
    }

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const driftUser = classifyDrift(body.user_message);

    if (body.client_id && driftUser.severity !== 'none') {
      await persistDrift(supabase, body.client_id, driftUser.severity, driftUser.category, driftUser.message);
    }

    if (driftUser.severity === 'red') {
      return json(200, {
        employee: body.employee || 'Approval Mode Supervisor',
        version: 0,
        tool_requests: [],
        final_answer: safeHumanReviewAnswer(driftUser.message),
        drift: driftUser,
        cached: false,
      });
    }

    if (!openaiApiKey) {
      return json(500, { error: 'Server misconfigured: missing OPENAI_API_KEY' });
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    // Scoring hook (optional) + inject into context.
    let injectedContext: Record<string, unknown> = {};

    if (body.client_id && body.score_inputs) {
      await supabase.rpc('compute_client_scores', {
        p_client_id: body.client_id,
        p_has_registered_business: body.score_inputs.has_registered_business,
        p_has_ein: body.score_inputs.has_ein,
        p_has_bank_account: body.score_inputs.has_bank_account,
        p_has_domain_email: body.score_inputs.has_domain_email,
        p_has_business_phone: body.score_inputs.has_business_phone,
        p_has_website: body.score_inputs.has_website,
        p_credit_score_est: body.score_inputs.credit_score_est,
        p_has_major_derog: body.score_inputs.has_major_derog,
        p_utilization_pct: body.score_inputs.utilization_pct,
        p_months_reserves: body.score_inputs.months_reserves,
        p_docs_ready: body.score_inputs.docs_ready,
      });

      const { data: scores } = await supabase
        .from('client_scores')
        .select('*')
        .eq('client_id', body.client_id)
        .maybeSingle();

      if (scores) injectedContext.client_scores = scores;
    }

    const targetEmployees = body.employees && body.employees.length > 0 ? body.employees : body.employee ? [body.employee] : [];
    if (targetEmployees.length === 0) {
      return json(400, { error: 'Missing employee (or employees) in request body.' });
    }

    const knowledgeContext = await loadKnowledgeContext(supabase, targetEmployees[0], body.user_message, body.context);
    const mergedContext = mergeContext(body.context, { ...knowledgeContext, ...injectedContext, drift: driftUser });

    const msgNorm = norm(body.user_message || '');
    const contextHash = sha256(stableStringify(mergedContext));

    const cacheKey = sha256(
      JSON.stringify({
        employees: targetEmployees,
        arbitrate: Boolean(body.arbitrate && targetEmployees.length > 1),
        model,
        mode: body.mode,
        ctx: contextHash,
        msg: msgNorm,
        approval_mode: body.approval_mode,
        drift: driftUser.severity,
      })
    );

    const hit = await cacheLookup(supabase, cacheKey);
    if (hit) return json(200, { ...hit, cached: true });

    const approvalRequired = body.approval_mode || driftUser.severity === 'orange';

    let responsePayload: any;

    if (body.arbitrate && targetEmployees.length > 1) {
      // Run employees in parallel
      const outputs = await Promise.all(
        targetEmployees.map(async (emp) => {
          const agent = await loadAgent(supabase, emp);
          const out = await callOpenAIWithSchema<AgentJson>({
            apiKey: openaiApiKey,
            model,
            instructions: buildInstructions(agent.system_prompt || '', body.mode, driftUser.severity),
            userText: buildUserContent(body.user_message, mergedContext),
            schema: AgentJsonSchema,
          });
          const validated = AgentJsonSchemaZ.safeParse(out);
          return {
            employee: emp,
            version: agent.version ?? 1,
            tool_requests: validated.success ? validated.data.tool_requests : [],
            final_answer: validated.success ? validated.data.final_answer : String((out as any)?.final_answer || ''),
          };
        })
      );

      const arbiter = await loadAgent(supabase, 'Nexus Arbiter', { allowMissing: true });
      const arbiterPrompt =
        (arbiter?.system_prompt && String(arbiter.system_prompt)) ||
        'You are an inter-agent arbitration layer. Combine multiple agent recommendations into a single safe, actionable plan with no contradictions.';

      const arbiterContext = {
        ...mergedContext,
        agent_outputs: outputs.map((o) => ({ employee: o.employee, version: o.version, final_answer: o.final_answer })),
      };

      const arbiterOut = await callOpenAIWithSchema<AgentJson>({
        apiKey: openaiApiKey,
        model,
        instructions: buildInstructions(arbiterPrompt, body.mode, driftUser.severity),
        userText: buildUserContent(body.user_message, arbiterContext),
        schema: AgentJsonSchema,
      });

      const parsed = AgentJsonSchemaZ.safeParse(arbiterOut);
      const final_answer = parsed.success ? parsed.data.final_answer : safeHumanReviewAnswer('Arbiter output failed validation.');

      responsePayload = {
        employee: 'Nexus Arbiter',
        version: arbiter?.version ?? 1,
        tool_requests: parsed.success ? parsed.data.tool_requests : [],
        final_answer,
        drift: driftUser,
        agent_outputs: outputs,
      };
    } else {
      const employee = targetEmployees[0];
      const agent = await loadAgent(supabase, employee);

      const out = await callOpenAIWithSchema<AgentJson>({
        apiKey: openaiApiKey,
        model,
        instructions: buildInstructions(agent.system_prompt || '', body.mode, driftUser.severity),
        userText: buildUserContent(body.user_message, mergedContext),
        schema: AgentJsonSchema,
      });

      const parsed = AgentJsonSchemaZ.safeParse(out);
      responsePayload = {
        employee: agent.name,
        version: agent.version ?? 1,
        tool_requests: parsed.success ? parsed.data.tool_requests : [],
        final_answer: parsed.success ? parsed.data.final_answer : safeHumanReviewAnswer('Agent output failed validation.'),
        drift: driftUser,
      };
    }

    const driftOut = classifyDrift(String(responsePayload.final_answer || ''));
    const requireSupervisor = approvalRequired || driftOut.severity === 'orange' || driftOut.severity === 'red';

    if (body.client_id && driftOut.severity !== 'none') {
      await persistDrift(supabase, body.client_id, driftOut.severity, driftOut.category, driftOut.message);
    }

    if (requireSupervisor) {
      const supervisor = await loadAgent(supabase, 'Approval Mode Supervisor', { allowMissing: true });
      const supervisorPrompt =
        (supervisor?.system_prompt && String(supervisor.system_prompt)) ||
        'You are an approval supervisor. Check compliance (no guarantees, no deception), safety, and clarity. Return JSON: {approved,reasons,required_edits,risk_level}.';

      const reviewText = `PROPOSED_OUTPUT:\n${String(responsePayload.final_answer || '')}\n\nUSER_MESSAGE:\n${body.user_message}\n\nDRIFT_USER:\n${JSON.stringify(driftUser)}\n\nDRIFT_OUTPUT:\n${JSON.stringify(driftOut)}\n\nCONTEXT(JSON):\n${JSON.stringify(mergedContext)}`;

      const supOut = await callOpenAIWithSchema<SupervisorOut>({
        apiKey: openaiApiKey,
        model,
        instructions: `${supervisorPrompt}\n\n${GLOBAL_GUARDRAILS}`,
        userText: reviewText,
        schema: SupervisorSchema,
      });

      const validated = SupervisorSchemaZ.safeParse(supOut);
      const supervisorResult = validated.success
        ? validated.data
        : ({
            approved: false,
            reasons: ['Supervisor output invalid JSON.'],
            required_edits: ['Re-run supervisor with correct JSON output.'],
            risk_level: 'critical',
          } satisfies SupervisorOut);

      responsePayload.supervisor = supervisorResult;

      if (!supervisorResult.approved || supervisorResult.risk_level === 'critical') {
        responsePayload.tool_requests = [];
        responsePayload.final_answer = safeHumanReviewAnswer(
          supervisorResult.reasons.length ? supervisorResult.reasons.join(' ') : 'Supervisor rejected output.'
        );
      }
    }

    await cacheStore(supabase, {
      cache_key: cacheKey,
      employee: responsePayload.employee,
      user_message: body.user_message,
      context_hash: contextHash,
      response: responsePayload,
    });

    return json(200, { ...responsePayload, cached: false });
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'Bad Request';
    return json(400, { error: msg });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function buildInstructions(systemPrompt: string, mode: 'simulated' | 'live', driftSeverity: DriftSeverity) {
  const caution =
    driftSeverity === 'yellow'
      ? '\n\nCAUTION: User is pressuring for guarantees/timelines. Use educational framing and avoid promises.'
      : '';
  return `${String(systemPrompt || '')}\n\n${GLOBAL_GUARDRAILS}\n\nCURRENT_MODE: ${mode}${caution}`;
}

async function callOpenAIWithSchema<T>(args: {
  apiKey: string;
  model: string;
  instructions: string;
  userText: string;
  schema: any;
}): Promise<T> {
  const payloadJsonSchema = {
    model: args.model,
    instructions: args.instructions,
    input: [{ role: 'user', content: [{ type: 'input_text', text: args.userText }] }],
    text: {
      format: {
        type: 'json_schema',
        name: 'response',
        schema: args.schema,
        strict: true,
      },
    },
  };

  try {
    const data = await openaiPost(args.apiKey, payloadJsonSchema);
    return safeJsonParse(extractOutputText(data)) as T;
  } catch {
    // Fallback for accounts/models that don't support json_schema.
    const payloadJsonObject = {
      model: args.model,
      instructions: args.instructions,
      input: [{ role: 'user', content: [{ type: 'input_text', text: args.userText }] }],
      text: { format: { type: 'json_object' } },
    };

    const data = await openaiPost(args.apiKey, payloadJsonObject);
    return safeJsonParse(extractOutputText(data)) as T;
  }
}

async function openaiPost(apiKey: string, payload: any) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text || `OpenAI error (${res.status})`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('OpenAI returned non-JSON response');
  }
}

function extractOutputText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text;

  const parts: string[] = [];
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === 'output_text' && typeof c?.text === 'string') parts.push(c.text);
    }
  }

  return parts.join('\n').trim();
}

function buildUserContent(userMessage: string, context?: unknown) {
  if (context === undefined) return userMessage;
  return `CONTEXT(JSON): ${JSON.stringify(context)}\n\nUSER_MESSAGE: ${userMessage}`;
}

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function mergeContext(original: unknown, injected: Record<string, unknown>) {
  if (original && typeof original === 'object' && !Array.isArray(original)) {
    return { ...(original as Record<string, unknown>), ...injected };
  }
  return injected;
}

async function loadAgent(
  supabase: ReturnType<typeof createClient>,
  name: string,
  opts: { allowMissing?: boolean } = {}
): Promise<{ id: string; name: string; system_prompt: string; version: number } | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, system_prompt, version')
    .eq('name', name)
    .maybeSingle();

  if (error || !data) {
    if (opts.allowMissing) return null;
    throw new Error(`Agent not found: ${name}`);
  }

  return data as any;
}

async function loadKnowledgeContext(
  supabase: ReturnType<typeof createClient>,
  employeeName: string,
  userMessage: string,
  context?: unknown
) {
  const result: { playbooks: any[]; knowledge: any[] } = { playbooks: [], knowledge: [] };

  const docId =
    context && typeof context === 'object' && !Array.isArray(context) ? (context as any).doc_id : undefined;
  const normalizedDocId = typeof docId === 'string' && docId.length > 10 ? docId : undefined;

  try {
    let q = supabase
      .from('playbooks')
      .select('title, summary, rules, checklist, templates, doc_id')
      .order('created_at', { ascending: false })
      .limit(2);

    if (normalizedDocId) q = q.eq('doc_id', normalizedDocId);

    const { data: playbooks, error } = await q;
    if (!error) result.playbooks = playbooks || [];
  } catch {
    // ignore
  }

  try {
    if (normalizedDocId) {
      const { data: docs, error } = await supabase
        .from('knowledge_docs')
        .select('id, title, source_url, content')
        .eq('id', normalizedDocId)
        .limit(1);

      if (!error) {
        result.knowledge = (docs || []).map((d: any) => ({
          title: d.title,
          source_url: d.source_url,
          snippet: String(d.content || '').slice(0, 1400),
          doc_id: d.id,
          employee_hint: employeeName,
        }));
      }
    } else {
      const q = String(userMessage || '')
        .split(/\s+/)
        .slice(0, 6)
        .join(' ')
        .trim();

      if (q) {
        const { data: docs, error } = await supabase
          .from('knowledge_docs')
          .select('id, title, source_url, content')
          .textSearch('content', q, { type: 'plain' })
          .order('created_at', { ascending: false })
          .limit(2);

        if (!error) {
          result.knowledge = (docs || []).map((d: any) => ({
            title: d.title,
            source_url: d.source_url,
            snippet: String(d.content || '').slice(0, 1200),
            doc_id: d.id,
            employee_hint: employeeName,
          }));
        }
      }
    }
  } catch {
    // ignore
  }

  return result;
}
