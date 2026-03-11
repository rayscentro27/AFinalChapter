import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createHash } from "node:crypto";

const BodySchema = z.object({
  employee: z.string().min(1),
  user_message: z.string().min(1),
  context: z.unknown().optional(),
  mode: z.enum(["simulated", "live"]).optional().default("simulated"),
  approval_mode: z.boolean().optional().default(false),
  client_id: z.string().optional(),
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
        args: z.record(z.unknown()).default({}),
        reason: z.string().default(""),
      })
    )
    .default([]),
  final_answer: z.string(),
});

const AgentJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    tool_requests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          args: { type: "object" },
          reason: { type: "string" },
        },
        required: ["name", "args", "reason"],
      },
    },
    final_answer: { type: "string" },
  },
  required: ["tool_requests", "final_answer"],
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
    let q = supabase.from('agent_cache').select('response, created_at').eq('cache_key', cacheKey).maybeSingle();
    const { data, error } = await q;
    if (error) return null;

    if (!data?.response) return null;

    if (CACHE_TTL_MS > 0 && data.created_at) {
      const cutoff = Date.now() - CACHE_TTL_MS;
      const ts = Date.parse(String(data.created_at));
      if (Number.isFinite(ts) && ts < cutoff) return null;
    }

    return data.response;
  } catch {
    // Table may not exist yet or RLS could block if misconfigured.
    return null;
  }
}

async function cacheStore(supabase: any, row: {
  cache_key: string;
  employee: string;
  user_message: string;
  context_hash: string;
  response: any;
}) {
  try {
    const { error } = await supabase
      .from('agent_cache')
      .upsert({
        cache_key: row.cache_key,
        employee: row.employee,
        user_message: row.user_message,
        context_hash: row.context_hash,
        response: row.response,
      });

    if (error) return;
  } catch {
    // ignore
  }
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const geminiApiKey = process.env.API_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(500, {
        error: "Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }
    if (!openaiApiKey && !geminiApiKey) {
      return json(500, { error: "Server misconfigured: missing OPENAI_API_KEY or API_KEY" });
    }

    const body = BodySchema.parse(JSON.parse(event.body || "{}"));

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, system_prompt, version")
      .eq("name", body.employee)
      .single();

    if (agentErr || !agent) {
      return json(404, { error: `Agent not found: ${body.employee}` });
    }

    const knowledgeContext = await loadKnowledgeContext(
      supabase,
      body.employee,
      body.user_message,
      body.context
    );

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const mergedContext = mergeContext(
      body.context,
      {
        ...knowledgeContext,
        runtime: {
          approval_mode: body.approval_mode,
          client_id: body.client_id || null,
        },
      }
    );

    // Cache key includes employee, mode, model, agent version, normalized message, and merged context.
    const msgNorm = norm(body.user_message || "");
    const contextHash = sha256(stableStringify(mergedContext));
    const cacheKey = sha256(
      String(body.employee) +
        "||mode:" + String(body.mode) +
        "||model:" + String(model) +
        "||agentv:" + String(agent.version ?? 1) +
        "||ctx:" + String(contextHash) +
        "||msg:" + String(msgNorm)
    );

    const hit = await cacheLookup(supabase, cacheKey);
    if (hit) {
      return json(200, { ...hit, cached: true });
    }

    let out: AgentJson;

    if (openaiApiKey) {
      try {
        out = await callOpenAI({
          apiKey: openaiApiKey,
          model,
          systemPrompt: String(agent.system_prompt || ""),
          userMessage: body.user_message,
          context: mergedContext,
          mode: body.mode,
        });
      } catch (openaiErr: any) {
        if (!geminiApiKey) throw openaiErr;
        out = await callGeminiFallback({
          apiKey: geminiApiKey,
          systemPrompt: String(agent.system_prompt || ""),
          userMessage: body.user_message,
          context: mergedContext,
          mode: body.mode,
        });
      }
    } else {
      out = await callGeminiFallback({
        apiKey: String(geminiApiKey),
        systemPrompt: String(agent.system_prompt || ""),
        userMessage: body.user_message,
        context: mergedContext,
        mode: body.mode,
      });
    }
    const responsePayload = {
      employee: agent.name,
      version: agent.version ?? 1,
      tool_requests: out.tool_requests,
      final_answer: out.final_answer,
    };

    await cacheStore(supabase, {
      cache_key: cacheKey,
      employee: body.employee,
      user_message: body.user_message,
      context_hash: contextHash,
      response: responsePayload,
    });

    return json(200, { ...responsePayload, cached: false });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Bad Request";
    return json(400, { error: msg });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

async function callOpenAI(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  context?: unknown;
  mode: "simulated" | "live";
}): Promise<AgentJson> {
  const instructions = `${args.systemPrompt}\n\nCURRENT_MODE: ${args.mode}`;
  const userText = buildUserContent(args.userMessage, args.context);

  const payloadJsonSchema = {
    model: args.model,
    instructions,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: userText }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "agent_response",
        schema: AgentJsonSchema,
        strict: true,
      },
    },
  };

  try {
    const data = await openaiPost(args.apiKey, payloadJsonSchema);
    return parseAgentJsonFromResponse(data);
  } catch (e: any) {
    // Fallback for accounts/models that don't support json_schema.
    const payloadJsonObject = {
      model: args.model,
      instructions,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: userText }],
        },
      ],
      text: { format: { type: "json_object" } },
    };

    const data = await openaiPost(args.apiKey, payloadJsonObject);
    return parseAgentJsonFromResponse(data);
  }
}

async function callGeminiFallback(args: {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  context?: unknown;
  mode: "simulated" | "live";
}): Promise<AgentJson> {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const instructions = `${args.systemPrompt}\n\nCURRENT_MODE: ${args.mode}`;
  const userText = buildUserContent(args.userMessage, args.context);

  const payload = {
    system_instruction: {
      parts: [
        {
          text:
            `${instructions}\n\n` +
            "Return ONLY valid JSON with this exact shape: {\"tool_requests\":[],\"final_answer\":\"...\"}",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userText }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${args.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  const text = await res.text();
  if (!res.ok) throw new Error(text || `Gemini error (${res.status})`);

  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON response");
  }

  const outText = extractGeminiText(data);
  const parsed = safeJsonParse(outText);
  const validated = AgentJsonSchemaZ.safeParse(parsed);

  if (validated.success) return validated.data;

  return {
    tool_requests: [],
    final_answer: String(outText || "Unable to parse Gemini response.").slice(0, 4000),
  };
}

function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .join("\n")
    .trim();
}

async function openaiPost(apiKey: string, payload: any) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text || `OpenAI error (${res.status})`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("OpenAI returned non-JSON response");
  }
}

function parseAgentJsonFromResponse(data: any): AgentJson {
  const outText = extractOutputText(data);
  const parsed = safeJsonParse(outText);
  const validated = AgentJsonSchemaZ.safeParse(parsed);

  if (!validated.success) {
    return {
      tool_requests: [],
      final_answer:
        "Agent response was not in the required JSON format. Update the system prompt to always output valid JSON.",
    };
  }

  return validated.data;
}

function extractOutputText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;

  const parts: string[] = [];
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") parts.push(c.text);
    }
  }

  return parts.join("\n").trim();
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
  if (original && typeof original === "object" && !Array.isArray(original)) {
    return { ...(original as Record<string, unknown>), ...injected };
  }
  return injected;
}

async function loadKnowledgeContext(
  supabase: ReturnType<typeof createClient>,
  employeeName: string,
  userMessage: string,
  context?: unknown
) {
  const result: { playbooks: any[]; knowledge: any[] } = { playbooks: [], knowledge: [] };

  const docId =
    context && typeof context === "object" && !Array.isArray(context)
      ? (context as any).doc_id
      : undefined;
  const normalizedDocId = typeof docId === "string" && docId.length > 10 ? docId : undefined;

  // Best-effort. If the tables aren't created yet, don't fail the whole agent call.
  try {
    let q = supabase
      .from("playbooks")
      .select("title, summary, rules, checklist, templates, doc_id")
      .order("created_at", { ascending: false })
      .limit(2);

    if (normalizedDocId) q = q.eq("doc_id", normalizedDocId);

    const { data: playbooks, error } = await q;
    if (!error) result.playbooks = playbooks || [];
  } catch {
    // ignore
  }

  try {
    // If doc_id is provided, pull that specific transcript. Otherwise, do a quick text search.
    if (normalizedDocId) {
      const { data: docs, error } = await supabase
        .from("knowledge_docs")
        .select("id, title, source_url, content")
        .eq("id", normalizedDocId)
        .limit(1);

      if (!error) {
        result.knowledge = (docs || []).map((d: any) => ({
          title: d.title,
          source_url: d.source_url,
          snippet: String(d.content || "").slice(0, 1400),
          doc_id: d.id,
          employee_hint: employeeName,
        }));
      }
    } else {
      const q = String(userMessage || "")
        .split(/\s+/)
        .slice(0, 6)
        .join(" ")
        .trim();

      if (q) {
        const { data: docs, error } = await supabase
          .from("knowledge_docs")
          .select("id, title, source_url, content")
          .textSearch("content", q, { type: "plain" })
          .order("created_at", { ascending: false })
          .limit(2);

        if (!error) {
          result.knowledge = (docs || []).map((d: any) => ({
            title: d.title,
            source_url: d.source_url,
            snippet: String(d.content || "").slice(0, 1200),
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
