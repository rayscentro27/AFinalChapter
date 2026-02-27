import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const BodySchema = z.object({
  pack_id: z.string().uuid(),
  run_title: z.string().optional().default("Scenario Run"),
  mode: z.enum(["simulated", "live"]).optional().default("simulated"),
  max_scenarios: z.number().int().min(1).max(200).optional().default(30),

  // Upgrade: better runtime behavior
  concurrency: z.number().int().min(1).max(10).optional().default(3),
  per_call_timeout_ms: z.number().int().min(1000).max(60000).optional().default(15000),
});

type AgentResponse = {
  employee: string;
  version: number;
  tool_requests: Array<{ name: string; args: Record<string, unknown>; reason: string }>;
  final_answer: string;
};

type ItemInsert = {
  run_id: string;
  scenario_index: number;
  scenario: any;
  model_output: any;
  passed: boolean;
  score: number;
  reasons: string[];
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(500, {
        error: "Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const authz = event.headers.authorization || (event.headers as any).Authorization;
    if (!authz || !String(authz).startsWith("Bearer ")) {
      return json(401, { error: "Missing Authorization Bearer token" });
    }

    const token = String(authz).slice("Bearer ".length).trim();
    const authedUser = await getAuthedUser(supabaseUrl, supabaseServiceRoleKey, token);
    if (!authedUser) return json(401, { error: "Invalid session" });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const isAllowed = await isAdminOrSupervisor(supabase, authedUser.id);
    if (!isAllowed) return json(403, { error: "Forbidden" });

    const body = BodySchema.parse(JSON.parse(event.body || "{}"));

    // 1) Load scenario pack
    const { data: pack, error: packErr } = await supabase
      .from("scenario_packs")
      .select("id, title, scenarios, doc_id")
      .eq("id", body.pack_id)
      .single();

    if (packErr || !pack) return json(404, { error: "Scenario pack not found" });

    const scenarios: any[] = Array.isArray((pack as any).scenarios) ? ((pack as any).scenarios as any[]) : [];
    const slice = scenarios.slice(0, body.max_scenarios);

    if (slice.length === 0) return json(422, { error: "Scenario pack has no scenarios." });

    // 2) Create run
    const agentName = String(slice[0]?.agent_name || "Unknown Agent");
    const { data: run, error: runErr } = await supabase
      .from("scenario_runs")
      .insert({
        pack_id: (pack as any).id,
        agent_name: agentName,
        run_title: body.run_title || (pack as any).title || "Scenario Run",
        mode: body.mode,
      })
      .select("id")
      .single();

    if (runErr || !run) throw runErr;

    const runId = String((run as any).id);

    // 3) Execute scenarios with a small concurrency limit
    const items: ItemInsert[] = [];
    const results: any[] = [];

    const pool = new PromisePool(body.concurrency);

    for (let i = 0; i < slice.length; i++) {
      const sc = slice[i];
      pool.add(async () => {
        const employee = String(sc.agent_name || agentName);
        const user_message = String(sc.user_message || "");

        try {
          const agentRes = await callAgentWithTimeout(
            event,
            employee,
            user_message,
            {
              doc_id: (pack as any).doc_id ?? undefined,
              scenario: sc,
            },
            body.mode,
            body.per_call_timeout_ms
          );

          const scored = scoreScenario(sc, agentRes);

          items.push({
            run_id: runId,
            scenario_index: i,
            scenario: sc,
            model_output: agentRes,
            passed: scored.passed,
            score: scored.score,
            reasons: scored.reasons,
          });

          results.push({ index: i, passed: scored.passed, score: scored.score, reasons: scored.reasons });
        } catch (e: any) {
          const reasons = ["FAIL", `Agent call failed: ${e?.message || e}`];
          items.push({
            run_id: runId,
            scenario_index: i,
            scenario: sc,
            model_output: { error: String(e?.message || e) },
            passed: false,
            score: 0,
            reasons,
          });

          results.push({ index: i, passed: false, score: 0, reasons });
        }
      });
    }

    await pool.run();

    // Keep result order stable
    results.sort((a, b) => a.index - b.index);
    items.sort((a, b) => a.scenario_index - b.scenario_index);

    // 4) Store results (batch insert)
    const { error: insErr } = await supabase.from("scenario_run_items").insert(items);
    if (insErr) throw insErr;

    const passed = results.filter((r) => r.passed).length;

    return json(200, {
      ok: true,
      run_id: runId,
      pack_title: (pack as any).title,
      scenarios_ran: slice.length,
      passed,
      failed: slice.length - passed,
      results,
    });
  } catch (e: any) {
    return json(400, { error: e?.message || "Bad Request" });
  }
};

class PromisePool {
  private readonly concurrency: number;
  private running = 0;
  private queue: Array<() => Promise<void>> = [];

  constructor(concurrency: number) {
    this.concurrency = Math.max(1, concurrency);
  }

  add(task: () => Promise<void>) {
    this.queue.push(task);
  }

  async run() {
    return await new Promise<void>((resolve, reject) => {
      const pump = () => {
        if (this.queue.length === 0 && this.running === 0) {
          resolve();
          return;
        }

        while (this.running < this.concurrency && this.queue.length > 0) {
          const task = this.queue.shift()!;
          this.running++;

          task()
            .then(() => {
              this.running--;
              pump();
            })
            .catch((err) => {
              reject(err);
            });
        }
      };

      pump();
    });
  }
}

async function getAuthedUser(supabaseUrl: string, apikey: string, token: string) {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.id) return null;
  return { id: String(data.id), email: String(data.email || "") };
}

async function isAdminOrSupervisor(supabase: any, userId: string) {
  try {
    const { data, error } = await supabase
      .from("tenant_memberships")
      .select("role")
      .eq("user_id", userId);

    if (error || !data) return false;

    const roles = (data as any[]).map((r) => String(r?.role || ""));
    return roles.includes("admin") || roles.includes("supervisor");
  } catch {
    return false;
  }
}

async function callAgentWithTimeout(
  event: any,
  employee: string,
  user_message: string,
  context: any,
  mode: "simulated" | "live",
  timeoutMs: number
): Promise<AgentResponse> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await callAgent(event, employee, user_message, context, mode, controller.signal);
  } finally {
    clearTimeout(t);
  }
}

async function callAgent(
  event: any,
  employee: string,
  user_message: string,
  context: any,
  mode: "simulated" | "live",
  signal?: AbortSignal
): Promise<AgentResponse> {
  const payload = { employee, user_message, context, mode };

  const url = `${baseUrl(event)}/.netlify/functions/agent`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Agent call failed");

  return data as AgentResponse;
}

function baseUrl(event: any) {
  const proto = (event?.headers?.["x-forwarded-proto"] || event?.headers?.["X-Forwarded-Proto"]) as string | undefined;
  const host = (event?.headers?.host || event?.headers?.Host) as string | undefined;
  if (proto && host) return `${proto}://${host}`;

  return process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.NETLIFY_URL || "http://localhost:8888";
}

function scoreScenario(sc: any, agentRes: any) {
  const answer = String(agentRes?.final_answer || "").toLowerCase();

  const mustInclude: string[] = Array.isArray(sc.must_include) ? sc.must_include : [];
  const mustNotSay: string[] = Array.isArray(sc.must_not_say) ? sc.must_not_say : [];

  const reasons: string[] = [];
  let score = 100;

  for (const req of mustInclude) {
    const r = String(req).toLowerCase().trim();
    if (r && !answer.includes(r)) {
      score -= 25;
      reasons.push(`Missing required: "${req}"`);
    }
  }

  for (const bad of mustNotSay) {
    const b = String(bad).toLowerCase().trim();
    if (b && answer.includes(b)) {
      score -= 40;
      reasons.push(`Contained prohibited: "${bad}"`);
    }
  }

  const expected = String(sc.expected_behavior || "").toLowerCase();
  if (expected && expected.length > 10) {
    const tokens = expected
      .split(/\W+/)
      .filter((t: string) => t.length >= 6)
      .slice(0, 6);
    const hits = tokens.filter((t: string) => answer.includes(t)).length;
    if (tokens.length > 0 && hits === 0) {
      score -= 10;
      reasons.push("Did not reflect expected behavior keywords");
    }
  }

  if (score < 0) score = 0;

  const passed = score >= 70;
  reasons.unshift(passed ? "PASS" : "FAIL");

  return { passed, score, reasons };
}

function json(statusCode: number, body: any) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
