import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

type Bundle = {
  schema_version?: string;
  modules?: any[];
  routing?: {
    cri_tiers?: unknown;
    tier_defaults?: unknown;
    global_safeguards?: unknown;
  };
};

const FALLBACK_SAFEGUARDS = [
  { code: "SAFE-01", name: "Backdating must be verifiable", enabled: true },
  { code: "SAFE-02", name: "Dispute tasks require evidence upload", enabled: true },
  { code: "SAFE-03", name: "Legal-sensitive workflows require human review", enabled: true },
  { code: "SAFE-04", name: "No fraud enablement", enabled: true },
  { code: "SAFE-05", name: "Platform terms/privacy compliance for lead gen/outreach", enabled: true },
];

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRole) {
      return json(500, {
        error: "Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const supabase = createClient(supabaseUrl, serviceRole);
    const body = JSON.parse(event.body || "{}");

    const bundleRaw = body.bundle_json;
    if (!bundleRaw) return json(400, { error: "bundle_json is required" });

    const bundle = normalizeBundle(bundleRaw);
    const modules = Array.isArray(bundle.modules) ? bundle.modules : [];
    if (!modules.length) {
      return json(400, { error: "bundle_json.modules must contain at least one module" });
    }

    const existingModules = new Set<string>();
    const existingTasks = new Set<string>();

    {
      const { data } = await supabase.from("training_modules").select("module_id");
      for (const row of data || []) {
        if (row?.module_id) existingModules.add(String(row.module_id));
      }
    }

    {
      const { data } = await supabase.from("training_tasks").select("task_id");
      for (const row of data || []) {
        if (row?.task_id) existingTasks.add(String(row.task_id));
      }
    }

    let modulesInserted = 0;
    let modulesUpdated = 0;
    let tasksInserted = 0;
    let tasksUpdated = 0;

    for (const m of modules) {
      const moduleId = safeText(m.module_id || m.id || m.code);
      const moduleName = safeText(m.module_name || m.name || moduleId);
      if (!moduleId || !moduleName) continue;

      const category = safeText(m.category || "general");
      const aiLesson = normalizeAiLesson(asObject(m.ai_lesson), m);
      const riskProfile = asObject(m.risk_profile);
      const criDefaults = asObject(m.cri_defaults);

      const complianceLevel = normalizeComplianceLevel(
        safeText(aiLesson.compliance_level || m.compliance_level || "standard")
      );
      const riskTier = normalizeRiskTier(safeText(riskProfile.risk_tier || m.risk_tier || "medium"));
      const keyRisks = asTextArray(riskProfile.key_risks || m.key_risks);
      const prohibited = asTextArray(
        riskProfile.prohibited_actions || aiLesson.prohibited_actions || m.prohibited_actions
      );

      const mandatoryHumanReview =
        Boolean(aiLesson.mandatory_human_review) ||
        Boolean(m.mandatory_human_review) ||
        /human review required/i.test(JSON.stringify(m));

      const normalizedRiskProfile = {
        ...riskProfile,
        risk_tier: riskTier,
        key_risks: keyRisks,
        prohibited_actions: prohibited,
      };

      const moduleRow = {
        module_id: moduleId,
        module_name: moduleName,
        category,
        compliance_level: complianceLevel,
        source_refs: asTextArray(m.source_refs),
        risk_tier: riskTier,
        key_risks: keyRisks,
        prohibited_actions: prohibited,
        mandatory_human_review: mandatoryHumanReview,
        risk_profile: normalizedRiskProfile,
        cri_impact_model: asObject(m.cri_impact_model),
        ai_lesson: aiLesson,
        cri_defaults: criDefaults,
      };

      const { error: moduleErr } = await supabase
        .from("training_modules")
        .upsert(moduleRow, { onConflict: "module_id" });
      if (moduleErr) throw moduleErr;

      if (existingModules.has(moduleId)) modulesUpdated += 1;
      else {
        modulesInserted += 1;
        existingModules.add(moduleId);
      }

      const tasks = Array.isArray(m.tasks) ? m.tasks : [];
      for (const t of tasks) {
        const taskId = safeText(t.task_id || t.id || t.code);
        const taskName = safeText(t.task_name || t.name || taskId);
        if (!taskId || !taskName) continue;

        const defaultAssignee =
          safeText(t.default_assignee_agent) ||
          computeDefaultAssigneeAgent({
            category,
            moduleName,
            taskName,
            riskTier,
            complianceLevel,
            task: t,
            module: m,
          });

        const taskRow = {
          task_id: taskId,
          module_id: moduleId,
          task_name: taskName,
          assigned_to: safeText(t.assigned_to || "Client"),
          priority: safeText(t.priority || "Medium"),
          estimated_time_minutes: toInt(t.estimated_time_minutes, 15),
          triggers: asTextArray(t.triggers),
          steps: asTextArray(t.steps),
          success_metrics: asTextArray(t.success_metrics),
          escalation_conditions: asObject(t.escalation_conditions),
          compliance_flags: asTextArray(t.compliance_flags),
          default_assignee_agent: defaultAssignee,
        };

        const { error: taskErr } = await supabase
          .from("training_tasks")
          .upsert(taskRow, { onConflict: "task_id" });
        if (taskErr) throw taskErr;

        if (existingTasks.has(taskId)) tasksUpdated += 1;
        else {
          tasksInserted += 1;
          existingTasks.add(taskId);
        }
      }
    }

    const routingRow = {
      singleton_key: "default",
      schema_version: safeText(bundle.schema_version) || "1.0",
      cri_tiers: asJson(bundle.routing?.cri_tiers, {}),
      tier_defaults: asJson(bundle.routing?.tier_defaults, {}),
      global_safeguards: normalizeGlobalSafeguards(bundle.routing?.global_safeguards, FALLBACK_SAFEGUARDS),
      updated_at: new Date().toISOString(),
    };

    let routingErr: any = null;
    {
      const res = await supabase.from("cri_routing").upsert(routingRow, { onConflict: "singleton_key" });
      routingErr = res.error;
    }

    if (routingErr && isSchemaVersionColumnMissing(routingErr)) {
      const fallback = { ...routingRow } as any;
      delete fallback.schema_version;
      const res = await supabase.from("cri_routing").upsert(fallback, { onConflict: "singleton_key" });
      routingErr = res.error;
    }

    if (routingErr) throw routingErr;

    return json(200, {
      ok: true,
      schema_version: bundle.schema_version || "1.0",
      modules_inserted: modulesInserted,
      modules_updated: modulesUpdated,
      tasks_inserted: tasksInserted,
      tasks_updated: tasksUpdated,
    });
  } catch (e: any) {
    return json(400, {
      error: e?.message || "Bad Request",
      details: typeof e?.details === "string" ? e.details : undefined,
    });
  }
};

function normalizeGlobalSafeguards(value: unknown, fallback: any[] = []): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, any>).map(([code, raw]) => {
      const row = raw && typeof raw === "object" ? (raw as Record<string, any>) : {};
      return { code, ...row };
    });
  }
  return Array.isArray(fallback) ? fallback : [];
}

function isSchemaVersionColumnMissing(error: any): boolean {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("schema_version") && (msg.includes("column") || msg.includes("does not exist"));
}

function normalizeBundle(raw: unknown): Bundle {
  if (typeof raw === "string") {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("bundle_json string must be valid JSON");
    return parsed as Bundle;
  }
  if (!raw || typeof raw !== "object") throw new Error("bundle_json must be object or JSON string");
  return raw as Bundle;
}

function safeText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : fallback;
}

function asObject(v: unknown): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

function asTextArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim()))
      .filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function asJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  return value as T;
}

function computeDefaultAssigneeAgent(args: {
  category: string;
  moduleName: string;
  taskName: string;
  riskTier: string;
  complianceLevel: string;
  task: any;
  module: any;
}): string {
  const blob = [
    args.category,
    args.moduleName,
    args.taskName,
    JSON.stringify(args.task || {}),
    JSON.stringify(args.module || {}),
  ]
    .join(" ")
    .toLowerCase();

  const riskHigh = /very\s*high|high/.test(String(args.riskTier || "").toLowerCase());
  const complianceCritical = /critical/.test(String(args.complianceLevel || "").toLowerCase());
  const integrityRisk = /(integrity|forensic|fraud|backdat|misrepresent|fabricat|synthetic)/.test(blob);

  const disputesOrIdentity = /(dispute|metro2|fdcpa|fcra|collection|validation letter|charge.?off|identity theft|id theft|identity fraud)/.test(blob);
  if (disputesOrIdentity) return "Lex Ledger";

  if (/(grant|sba grant|grant writing|grant match)/.test(blob)) return "Nova Grant";

  if (/(lead gen|lead generation|outreach|re-engage|reengage|prospect|cold dm|follow-up)/.test(blob)) {
    if (/(hunt|reactivat|stale)/.test(blob)) return "Ghost Hunter";
    return "Sentinel Scout";
  }

  if (/(governance|scoring|opportunity evaluation|workflow deconstruction|evaluation|risk model|triage)/.test(blob)) {
    return "Nexus Analyst";
  }

  if (/(infrastructure|banking stability|bank account|entity|llc|ein|formation|chex|ews)/.test(blob)) {
    if (integrityRisk || riskHigh || complianceCritical) return "Forensic Bot";
    return "Nexus Founder";
  }

  if (integrityRisk || riskHigh || complianceCritical) return "Forensic Bot";
  return "Nexus Analyst";
}

function normalizeAiLesson(aiLesson: Record<string, any>, moduleObj: Record<string, any>): Record<string, any> {
  const next = { ...aiLesson };
  const lessonRules = Array.isArray(aiLesson?.decision_rules) ? aiLesson.decision_rules : [];
  const moduleRules = Array.isArray(moduleObj?.decision_rules) ? moduleObj.decision_rules : [];

  if (lessonRules.length || moduleRules.length) {
    next.decision_rules = dedupeRules([...lessonRules, ...moduleRules]);
  }

  if (typeof next.mandatory_human_review !== "boolean" && typeof moduleObj?.mandatory_human_review === "boolean") {
    next.mandatory_human_review = Boolean(moduleObj.mandatory_human_review);
  }

  return next;
}

function dedupeRules(rules: any[]): any[] {
  const out: any[] = [];
  const seen = new Set<string>();

  for (const r of rules || []) {
    if (!r || typeof r !== "object") continue;
    const ruleId = safeText((r as any).id);
    const key = ruleId || JSON.stringify(r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }

  return out;
}

function normalizeComplianceLevel(level: string): string {
  const v = String(level || "").toLowerCase();
  if (!v) return "standard";
  if (v.includes("critical")) return "critical";
  if (v.includes("high")) return "high";
  if (v.includes("moderate") || v.includes("medium")) return "moderate";
  if (v.includes("low")) return "low";
  return safeText(level) || "standard";
}

function normalizeRiskTier(riskTier: string): string {
  const v = String(riskTier || "").toLowerCase();
  if (!v) return "Moderate";
  if (v.includes("very high")) return "Very High";
  if (/\bhigh\b/.test(v)) return "High";
  if (v.includes("moderate") || v.includes("medium")) return "Moderate";
  if (v.includes("low")) return "Low";
  if (v.includes("critical")) return "Critical";
  return safeText(riskTier) || "Moderate";
}

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
