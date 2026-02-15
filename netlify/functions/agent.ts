import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const BodySchema = z.object({
  employee: z.string().min(1),
  user_message: z.string().min(1),
  context: z.unknown().optional(),
  mode: z.enum(["simulated", "live"]).optional().default("simulated"),
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

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(500, {
        error: "Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }
    if (!openaiApiKey) {
      return json(500, { error: "Server misconfigured: missing OPENAI_API_KEY" });
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

    const knowledgeContext = await loadKnowledgeContext(supabase, body.employee, body.user_message);

    const out = await callOpenAI({
      apiKey: openaiApiKey,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      systemPrompt: String(agent.system_prompt || ""),
      userMessage: body.user_message,
      context: mergeContext(body.context, knowledgeContext),
      mode: body.mode,
    });

    return json(200, {
      employee: agent.name,
      version: agent.version ?? 1,
      tool_requests: out.tool_requests,
      final_answer: out.final_answer,
    });
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
  userMessage: string
) {
  const result: { playbooks: any[]; knowledge: any[] } = { playbooks: [], knowledge: [] };

  // Best-effort. If the tables aren't created yet, don't fail the whole agent call.
  try {
    const { data: playbooks, error } = await supabase
      .from("playbooks")
      .select("title, summary, rules, checklist, templates, doc_id")
      .order("created_at", { ascending: false })
      .limit(2);

    if (!error) result.playbooks = playbooks || [];
  } catch {
    // ignore
  }

  try {
    const q = String(userMessage || "")
      .split(/\s+/)
      .slice(0, 6)
      .join(" ")
      .trim();

    if (q) {
      const { data: docs, error } = await supabase
        .from("knowledge_docs")
        .select("title, source_url, content")
        .textSearch("content", q, { type: "plain" })
        .order("created_at", { ascending: false })
        .limit(2);

      if (!error) {
        result.knowledge = (docs || []).map((d: any) => ({
          title: d.title,
          source_url: d.source_url,
          snippet: String(d.content || "").slice(0, 1200),
          employee_hint: employeeName,
        }));
      }
    }
  } catch {
    // ignore
  }

  return result;
}
