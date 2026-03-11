import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

type ClientProfile = Record<string, any>;

type TrainingModule = {
  module_id: string;
  module_name: string;
  category: string;
  compliance_level: string;
  risk_tier: string;
  key_risks: string[];
  prohibited_actions: string[];
  mandatory_human_review: boolean;
  risk_profile?: Record<string, any>;
  cri_defaults?: Record<string, any>;
  ai_lesson: Record<string, any>;
};

type TrainingTask = {
  task_id: string;
  module_id: string;
  task_name: string;
  assigned_to: string;
  priority: string;
  estimated_time_minutes: number;
  triggers: string[];
  steps: string[];
  success_metrics: string[];
  escalation_conditions: Record<string, any>;
  compliance_flags: string[];
  default_assignee_agent: string;
};

type SelectedTask = {
  taskId: string;
  offerOnly: boolean;
  reasons: string[];
};

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

    const tenantId = safeText(body.tenant_id);
    const userId = safeText(body.user_id);
    const clientProfile = asObject(body.client_profile);

    if (!tenantId || !userId || !clientProfile || Object.keys(clientProfile).length === 0) {
      return json(400, {
        error: "tenant_id, user_id, client_profile are required",
      });
    }

    const { data: routingRow, error: routingErr } = await supabase
      .from("cri_routing")
      .select("schema_version,cri_tiers,tier_defaults,global_safeguards")
      .eq("singleton_key", "default")
      .maybeSingle();
    if (routingErr) throw routingErr;

    const criTiers = asObject(routingRow?.cri_tiers);
    const tierDefaults = asObject(routingRow?.tier_defaults);
    const globalSafeguards = normalizeGlobalSafeguards(routingRow?.global_safeguards);

    const { data: modulesData, error: modulesErr } = await supabase
      .from("training_modules")
      .select(
        "module_id,module_name,category,compliance_level,risk_tier,key_risks,prohibited_actions,mandatory_human_review,risk_profile,cri_defaults,ai_lesson"
      );
    if (modulesErr) throw modulesErr;

    const modules = (modulesData || []) as TrainingModule[];
    if (!modules.length) {
      return json(400, { error: "No training modules found. Import a bundle first." });
    }

    const { data: tasksData, error: tasksErr } = await supabase
      .from("training_tasks")
      .select(
        "task_id,module_id,task_name,assigned_to,priority,estimated_time_minutes,triggers,steps,success_metrics,escalation_conditions,compliance_flags,default_assignee_agent"
      );
    if (tasksErr) throw tasksErr;

    const tasks = (tasksData || []) as TrainingTask[];
    const tasksByModule = new Map<string, TrainingTask[]>();
    const taskById = new Map<string, TrainingTask>();
    for (const t of tasks) {
      taskById.set(t.task_id, t);
      const list = tasksByModule.get(t.module_id) || [];
      list.push(t);
      tasksByModule.set(t.module_id, list);
    }

    const moduleById = new Map<string, TrainingModule>();
    for (const m of modules) moduleById.set(m.module_id, m);

    const criScore = numberOrNull(clientProfile.cri_score);
    const tier = resolveCriTier(criScore, criTiers, tierDefaults);

    const selected = new Map<string, SelectedTask>();

    const assignModules = extractTierAssignModules(tier, tierDefaults);
    for (const moduleId of assignModules) {
      const moduleTasks = tasksByModule.get(moduleId) || [];
      for (const t of moduleTasks) {
        pushSelected(selected, t.task_id, false, `tier_default:${tier || "unknown"}`);
      }
    }

    for (const m of modules) {
      const rules = extractDecisionRules(m);
      for (const rule of rules) {
        if (!shouldApplyRule(rule, clientProfile)) continue;

        const action = normalizeRuleAction(rule);
        if (!action) continue;

        let ruleTaskIds = extractRuleTaskIds(rule);
        const ruleModuleIds = extractRuleModuleIds(rule);

        if (!ruleTaskIds.length && ruleModuleIds.length) {
          ruleTaskIds = ruleModuleIds.flatMap((moduleId) =>
            (tasksByModule.get(moduleId) || []).map((t) => t.task_id)
          );
        }

        if (!ruleTaskIds.length) {
          ruleTaskIds = (tasksByModule.get(m.module_id) || []).map((t) => t.task_id);
        }

        const offerOnly = action === "offer_tasks";
        for (const taskId of ruleTaskIds) {
          if (!taskById.has(taskId)) continue;
          pushSelected(selected, taskId, offerOnly, `decision_rule:${m.module_id}`);
        }
      }
    }

    if (!selected.size) {
      return json(200, {
        ok: true,
        tier,
        created: 0,
        skipped: 0,
        tasks: [],
      });
    }

    const selectedTaskIds = Array.from(selected.keys());

    const rows: Record<string, any>[] = [];
    const evidenceRows: Record<string, any>[] = [];
    const skipped: Array<{ task_id: string; reason: string }> = [];

    for (const [taskId, sel] of selected.entries()) {
      const task = taskById.get(taskId);
      if (!task) continue;

      const module = moduleById.get(task.module_id);
      if (!module) continue;

      const riskHigh = isRiskHigh(module.risk_tier);
      const complianceCritical = isComplianceCritical(module.compliance_level);
      const identityTheftContext = involvesIdentityTheft(task, module);
      const backdatingRequired = mentionsBackdating(task, module);
      const evidenceRequired = mentionsDisputeOrValidation(task, module);
      const humanReviewRequired =
        Boolean(module.mandatory_human_review) ||
        containsHumanApprovalFlag(task.compliance_flags);

      const helperAgents: string[] = [];
      if (riskHigh || complianceCritical || identityTheftContext) helperAgents.push("Forensic Bot");

      const primaryAssignee = task.default_assignee_agent || inferAssigneeFromModule(module, task);
      const signal = sel.offerOnly ? "yellow" : "red";
      const progress = sel.offerOnly ? "in_progress" : "not_started";

      const normalizedRiskProfile = {
        ...(asObject(module.risk_profile) || {}),
        risk_tier: module.risk_tier,
        key_risks: module.key_risks || [],
        prohibited_actions: module.prohibited_actions || [],
      };

      const meta = {
        source: "bundle_assignment",
        schema_version: safeText(routingRow?.schema_version) || "1.0",
        module_id: module.module_id,
        training_task_id: task.task_id,
        compliance_level: module.compliance_level,
        risk_profile: normalizedRiskProfile,
        cri_defaults: asObject(module.cri_defaults),
        safeguards: globalSafeguards,
        offer_only: sel.offerOnly,
        assignment_reasons: sel.reasons,
        gates: {
          evidence_required: evidenceRequired,
          human_review_required: humanReviewRequired || riskHigh || complianceCritical,
          backdating_verification_required: backdatingRequired,
          fraud_refusal_required: true,
          outreach_privacy_required: true,
        },
        helper_agents: helperAgents,
        approval_mode_enforced: riskHigh || complianceCritical || humanReviewRequired,
        progress,
      };

      const due = new Date();
      due.setDate(due.getDate() + 7);

      rows.push({
        tenant_id: tenantId,
        user_id: userId,
        task_id: task.task_id,
        title: task.task_name,
        description: `Module ${module.module_id}: ${module.module_name}`,
        signal,
        status_rg: signal,
        progress,
        due_date: due.toISOString().slice(0, 10),
        due_at: due.toISOString(),
        type: normalizeTaskType(task.priority),
        assigned_employee: primaryAssignee,
        assignee_agent: primaryAssignee,
        group_key: module.category || "bundle",
        template_key: task.task_id,
        meta,
        metadata: meta,
      });

      evidenceRows.push({
        tenant_id: tenantId,
        user_id: userId,
        task_id: task.task_id,
        evidence_uploaded: false,
        verification_flag: false,
        human_approved: false,
        notes: "",
      });
    }

    if (!rows.length) {
      return json(200, {
        ok: true,
        tier,
        created: 0,
        skipped: skipped.length,
        skipped_tasks: skipped,
        tasks: [],
      });
    }

    const upsertResult = await upsertClientTasksCompat(supabase, rows);
    if (upsertResult.error) throw upsertResult.error;

    const evidenceRowsEffective = evidenceRows.map((row) => ({
      ...row,
      task_id: upsertResult.taskIdMap?.[row.task_id] || row.task_id,
    }));

    const { error: evidenceErr } = await supabase
      .from("task_evidence")
      .upsert(evidenceRowsEffective, { onConflict: "tenant_id,user_id,task_id" });
    if (evidenceErr) throw evidenceErr;

    return json(200, {
      ok: true,
      tier,
      created: (upsertResult.data || []).length,
      skipped: skipped.length,
      skipped_tasks: skipped,
      tasks: upsertResult.data || [],
      status_mode: upsertResult.statusMode,
    });
  } catch (e: any) {
    return json(400, {
      error: e?.message || "Bad Request",
      details: typeof e?.details === "string" ? e.details : undefined,
    });
  }
};

async function upsertClientTasksCompat(supabase: any, rows: Record<string, any>[]) {
  const selectCols = "task_id,title,signal,status,status_rg,assignee_agent,assigned_employee,user_id";

  const enumRows = rows.map((r) => ({
    ...r,
    status: r.status_rg,
  }));

  let res = await supabase
    .from("client_tasks")
    .upsert(enumRows, { onConflict: "tenant_id,user_id,task_id" })
    .select(selectCols);

  if (!res.error) {
    return {
      data: res.data as any[] | null,
      error: null,
      statusMode: "enum",
      taskIdMap: identityTaskIdMap(rows),
    };
  }

  if (isMissingConflictConstraint(res.error) || isTenantTaskPrimaryKeyConflict(res.error)) {
    const fallback = await writeClientTasksWithoutConflict(supabase, enumRows, "enum");
    if (!fallback.error) return fallback;
    res = { ...res, error: fallback.error } as any;
  }

  if (!shouldFallbackToLegacyStatus(res.error)) {
    return {
      data: null,
      error: res.error,
      statusMode: "enum",
      taskIdMap: identityTaskIdMap(rows),
    };
  }

  const legacyRows = rows.map((r) => ({
    ...r,
    status: r.progress === "completed" ? "completed" : "pending",
  }));

  res = await supabase
    .from("client_tasks")
    .upsert(legacyRows, { onConflict: "tenant_id,user_id,task_id" })
    .select(selectCols);

  if (isMissingConflictConstraint(res.error) || isTenantTaskPrimaryKeyConflict(res.error)) {
    return writeClientTasksWithoutConflict(supabase, legacyRows, "legacy");
  }

  return {
    data: res.data as any[] | null,
    error: res.error,
    statusMode: "legacy",
    taskIdMap: identityTaskIdMap(rows),
  };
}

async function writeClientTasksWithoutConflict(
  supabase: any,
  rows: Record<string, any>[],
  statusMode: "enum" | "legacy"
) {
  const finalRows: Record<string, any>[] = [];
  const taskIdMap: Record<string, string> = {};

  for (const originalRow of rows) {
    let row = { ...originalRow };

    while (true) {
      const { data: existing, error: findErr } = await supabase
        .from("client_tasks")
        .select("id")
        .eq("tenant_id", row.tenant_id)
        .eq("user_id", row.user_id)
        .eq("task_id", row.task_id)
        .maybeSingle();

      if (findErr) {
        return { data: null, error: findErr, statusMode, taskIdMap };
      }

      if (existing?.id) {
        const { error: updErr } = await supabase
          .from("client_tasks")
          .update(row)
          .eq("id", existing.id);

        if (updErr) {
          return { data: null, error: updErr, statusMode, taskIdMap };
        }

        finalRows.push(row);
        taskIdMap[originalRow.task_id] = row.task_id;
        break;
      }

      const { error: insErr } = await supabase.from("client_tasks").insert(row);
      if (!insErr) {
        finalRows.push(row);
        taskIdMap[originalRow.task_id] = row.task_id;
        break;
      }

      if (isTenantTaskPrimaryKeyConflict(insErr)) {
        row = {
          ...originalRow,
          task_id: buildScopedTaskId(originalRow.task_id, originalRow.user_id),
        };
        continue;
      }

      return { data: null, error: insErr, statusMode, taskIdMap };
    }
  }

  const taskIds = Array.from(new Set(finalRows.map((r) => r.task_id).filter(Boolean)));
  const { data, error } = await supabase
    .from("client_tasks")
    .select("task_id,title,signal,status,status_rg,assignee_agent,assigned_employee,user_id")
    .eq("tenant_id", finalRows[0]?.tenant_id)
    .eq("user_id", finalRows[0]?.user_id)
    .in("task_id", taskIds);

  return {
    data: (data || null) as any[] | null,
    error,
    statusMode,
    taskIdMap,
  };
}

function identityTaskIdMap(rows: Record<string, any>[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (!row?.task_id) continue;
    map[row.task_id] = row.task_id;
  }
  return map;
}

function buildScopedTaskId(taskId: string, userId: string): string {
  return String(taskId || "") + "__u__" + String(userId || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function shouldFallbackToLegacyStatus(error: any): boolean {
  const msg = String(error?.message || "");
  return /invalid input value for enum|task_status|status/i.test(msg);
}

function isMissingConflictConstraint(error: any): boolean {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("no unique or exclusion constraint matching the on conflict specification");
}

function isTenantTaskPrimaryKeyConflict(error: any): boolean {
  const msg = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const text = msg + " " + details;
  return text.includes("duplicate key value violates unique constraint") && text.includes("(tenant_id, task_id)");
}

function extractDecisionRules(module: TrainingModule): any[] {
  const aiLesson = asObject(module.ai_lesson);
  const fromLesson = Array.isArray(aiLesson.decision_rules) ? aiLesson.decision_rules : [];
  const topLevel = Array.isArray((module as any).decision_rules) ? (module as any).decision_rules : [];
  return dedupeRules([...fromLesson, ...topLevel]);
}

function dedupeRules(rules: any[]): any[] {
  const out: any[] = [];
  const seen = new Set<string>();

  for (const rule of rules || []) {
    if (!rule || typeof rule !== 'object') continue;
    const key = safeText((rule as any).id) || JSON.stringify(rule);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rule);
  }

  return out;
}

function shouldApplyRule(rule: any, profile: ClientProfile): boolean {
  const condition =
    typeof rule?.if === "string"
      ? rule.if
      : typeof rule?.when === "string"
      ? rule.when
      : typeof rule?.condition === "string"
      ? rule.condition
      : typeof rule?.expression === "string"
      ? rule.expression
      : null;

  if (!condition) {
    if (rule && typeof rule === "object") {
      if (rule.field && (rule.operator || rule.op)) {
        return evaluateStructuredRule(rule, profile);
      }
    }
    return true;
  }

  return evaluateExpression(normalizeExpression(condition), profile);
}

function normalizeRuleAction(rule: any): "assign_tasks" | "offer_tasks" | null {
  const rawAction =
    safeText(rule?.action) ||
    safeText(rule?.then) ||
    safeText(rule?.result) ||
    safeText(rule?.effect) ||
    safeText(rule?.outcome);

  if (/offer_tasks/i.test(rawAction) || rule?.offer_tasks) return "offer_tasks";
  if (/assign_tasks/i.test(rawAction) || rule?.assign_tasks) return "assign_tasks";

  const thenObj = asObject(rule?.then);
  const nestedAction = safeText(thenObj.action || thenObj.type || thenObj.effect);
  if (/offer_tasks/i.test(nestedAction)) return "offer_tasks";
  if (/assign_tasks/i.test(nestedAction)) return "assign_tasks";

  return null;
}

function extractRuleTaskIds(rule: any): string[] {
  const args = asObject(rule?.args);
  const thenObj = asObject(rule?.then);
  const thenArgs = asObject(thenObj?.args);

  const direct = [
    ...asTextArray(rule?.task_ids),
    ...asTextArray(rule?.tasks),
    ...asTextArray(rule?.assign_tasks),
    ...asTextArray(rule?.offer_tasks),
    ...asTextArray(args.task_ids),
    ...asTextArray(args.tasks),
    ...asTextArray(args.assign_tasks),
    ...asTextArray(args.offer_tasks),
  ];

  const nested = [
    ...asTextArray(thenObj.task_ids),
    ...asTextArray(thenObj.tasks),
    ...asTextArray(thenObj.assign_tasks),
    ...asTextArray(thenObj.offer_tasks),
    ...asTextArray(thenArgs.task_ids),
    ...asTextArray(thenArgs.tasks),
    ...asTextArray(thenArgs.assign_tasks),
    ...asTextArray(thenArgs.offer_tasks),
  ];

  return Array.from(new Set([...direct, ...nested].filter(Boolean)));
}

function extractRuleModuleIds(rule: any): string[] {
  const args = asObject(rule?.args);
  const thenObj = asObject(rule?.then);
  const thenArgs = asObject(thenObj?.args);

  const ids = [
    ...asTextArray(rule?.module_ids),
    ...asTextArray(rule?.modules),
    ...asTextArray(args.module_ids),
    ...asTextArray(args.modules),
    ...asTextArray(thenObj.module_ids),
    ...asTextArray(thenObj.modules),
    ...asTextArray(thenArgs.module_ids),
    ...asTextArray(thenArgs.modules),
  ];

  return Array.from(new Set(ids.filter(Boolean)));
}

function pushSelected(map: Map<string, SelectedTask>, taskId: string, offerOnly: boolean, reason: string) {
  const existing = map.get(taskId);
  if (!existing) {
    map.set(taskId, {
      taskId,
      offerOnly,
      reasons: [reason],
    });
    return;
  }
  existing.offerOnly = existing.offerOnly && offerOnly;
  existing.reasons.push(reason);
}

function resolveCriTier(
  criScore: number | null,
  criTiers: Record<string, any>,
  tierDefaults: Record<string, any>
): string {
  const fallback = inferConservativeTier(
    Object.keys(tierDefaults).length ? Object.keys(tierDefaults) : Object.keys(criTiers)
  );
  if (criScore === null) return fallback;

  const tiers = flattenCriTiers(criTiers);
  for (const tier of tiers) {
    const min = Number.isFinite(tier.min) ? tier.min : Number.NEGATIVE_INFINITY;
    const max = Number.isFinite(tier.max) ? tier.max : Number.POSITIVE_INFINITY;
    if (criScore >= min && criScore <= max) return tier.name;
  }

  return fallback;
}

function extractTierAssignModules(tier: string, tierDefaults: Record<string, any>): string[] {
  const direct = asObject(tierDefaults[tier]);
  const list = asTextArray(direct.assign_modules || direct.modules || direct.assignModules);
  if (list.length) return list;

  for (const [key, value] of Object.entries(tierDefaults || {})) {
    if (key.toLowerCase() === String(tier || "").toLowerCase()) {
      const obj = asObject(value);
      const found = asTextArray(obj.assign_modules || obj.modules || obj.assignModules);
      if (found.length) return found;
    }
  }

  return [];
}

function flattenCriTiers(criTiers: Record<string, any>): Array<{ name: string; min: number; max: number }> {
  const out: Array<{ name: string; min: number; max: number }> = [];

  if (Array.isArray(criTiers)) {
    for (const row of criTiers) {
      const obj = asObject(row);
      const name = safeText(obj.name || obj.tier || obj.label);
      if (!name) continue;
      const min = numberOr(obj.min ?? obj.from ?? obj.start, Number.NEGATIVE_INFINITY);
      const max = numberOr(obj.max ?? obj.to ?? obj.end, Number.POSITIVE_INFINITY);
      out.push({ name, min, max });
    }
    return out;
  }

  for (const [name, raw] of Object.entries(criTiers || {})) {
    const obj = asObject(raw);
    const min = numberOr(obj.min ?? obj.from ?? obj.start, Number.NEGATIVE_INFINITY);
    const max = numberOr(obj.max ?? obj.to ?? obj.end, Number.POSITIVE_INFINITY);
    out.push({ name, min, max });
  }

  out.sort((a, b) => a.min - b.min);
  return out;
}

function inferConservativeTier(knownNames: string[]): string {
  if (!knownNames.length) return "Tier 4";
  const explicitTier4 = knownNames.find((x) => /tier\s*4/i.test(x));
  if (explicitTier4) return explicitTier4;

  const sorted = [...knownNames].sort((a, b) => {
    const na = extractTierNumber(a);
    const nb = extractTierNumber(b);
    return nb - na;
  });
  return sorted[0] || "Tier 4";
}

function extractTierNumber(name: string): number {
  const match = name.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function normalizeTaskType(priority: string): string {
  const p = String(priority || "").toLowerCase();
  if (p.includes("upload")) return "upload";
  if (p.includes("review")) return "review";
  return "action";
}

function isRiskHigh(riskTier: string): boolean {
  return /very\s*high|high/.test(String(riskTier || "").toLowerCase());
}

function isComplianceCritical(level: string): boolean {
  return /critical/.test(String(level || "").toLowerCase());
}

function containsHumanApprovalFlag(flags: string[]): boolean {
  const joined = (flags || []).join(" ").toLowerCase();
  return /human approval required|legal-sensitive|legal sensitive/.test(joined);
}

function mentionsBackdating(task: TrainingTask, module: TrainingModule): boolean {
  const blob = [
    task.task_name,
    ...(task.steps || []),
    module.module_name,
    module.category,
    ...(module.key_risks || []),
    JSON.stringify(module.ai_lesson || {}),
  ]
    .join(" ")
    .toLowerCase();

  return /backdat/.test(blob);
}

function mentionsDisputeOrValidation(task: TrainingTask, module: TrainingModule): boolean {
  const blob = [
    task.task_name,
    ...(task.steps || []),
    module.module_name,
    module.category,
    ...(task.compliance_flags || []),
    ...(module.key_risks || []),
  ]
    .join(" ")
    .toLowerCase();

  return /(dispute|validation|metro2|fdcpa|fcra|collection|identity theft|id theft)/.test(blob);
}

function involvesIdentityTheft(task: TrainingTask, module: TrainingModule): boolean {
  const blob = [
    task.task_name,
    ...(task.steps || []),
    module.module_name,
    module.category,
    ...(module.key_risks || []),
    JSON.stringify(module.risk_profile || {}),
    JSON.stringify(module.ai_lesson || {}),
  ]
    .join(" ")
    .toLowerCase();

  return /(identity theft|id theft|identity fraud|impersonation)/.test(blob);
}

function inferAssigneeFromModule(module: TrainingModule, task: TrainingTask): string {
  const blob = [module.category, module.module_name, task.task_name].join(" ").toLowerCase();
  if (/(grant)/.test(blob)) return "Nova Grant";
  if (/(dispute|validation|metro2|fdcpa|fcra|collection|identity theft|id theft|identity fraud)/.test(blob))
    return "Lex Ledger";
  if (/(lead|outreach|prospect|reengage|re-engage)/.test(blob)) return "Ghost Hunter";
  if (/(infrastructure|banking|entity|ein|llc|formation)/.test(blob)) return "Nexus Founder";
  if (/(governance|scoring|opportunity|evaluation|workflow deconstruction|triage)/.test(blob))
    return "Nexus Analyst";
  if (isRiskHigh(module.risk_tier) || isComplianceCritical(module.compliance_level)) return "Forensic Bot";
  return "Nexus Analyst";
}

function evaluateStructuredRule(rule: any, profile: ClientProfile): boolean {
  const field = safeText(rule.field);
  const op = safeText(rule.operator || rule.op);
  const target = rule.value;
  if (!field || !op) return false;
  const actual = getPath(profile, field);

  switch (op) {
    case "==":
    case "=":
      return actual === target;
    case "!=":
      return actual !== target;
    case ">":
      return Number(actual) > Number(target);
    case ">=":
      return Number(actual) >= Number(target);
    case "<":
      return Number(actual) < Number(target);
    case "<=":
      return Number(actual) <= Number(target);
    default:
      return false;
  }
}

function evaluateExpression(expression: string, profile: ClientProfile): boolean {
  const parser = new ExpressionParser(normalizeExpression(expression), profile);
  return parser.parse();
}

function normalizeExpression(expression: string): string {
  return String(expression || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .trim();
}

class ExpressionParser {
  private tokens: string[];
  private idx = 0;
  private profile: ClientProfile;

  constructor(expression: string, profile: ClientProfile) {
    this.tokens = tokenize(expression);
    this.profile = profile;
  }

  parse(): boolean {
    const value = this.parseOr();
    return Boolean(value);
  }

  private parseOr(): any {
    let left = this.parseAnd();
    while (this.peek() === "||") {
      this.next();
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private parseAnd(): any {
    let left = this.parseComparison();
    while (this.peek() === "&&") {
      this.next();
      const right = this.parseComparison();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  private parseComparison(): any {
    const left = this.parsePrimary();
    const op = this.peek();

    if (["==", "!=", ">", "<", ">=", "<="].includes(op)) {
      this.next();
      const right = this.parsePrimary();
      return compare(left, right, op);
    }

    return left;
  }

  private parsePrimary(): any {
    const token = this.next();
    if (token === "(") {
      const v = this.parseOr();
      if (this.peek() === ")") this.next();
      return v;
    }

    if (token === "true") return true;
    if (token === "false") return false;
    if (token === "null") return null;
    if (isNumberToken(token)) return Number(token);
    if (isQuoted(token)) return unquote(token);

    if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(token)) {
      return getPath(this.profile, token);
    }

    return undefined;
  }

  private peek(): string {
    return this.tokens[this.idx] || "";
  }

  private next(): string {
    const t = this.tokens[this.idx] || "";
    this.idx += 1;
    return t;
  }
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re =
    /\s*(\|\||&&|>=|<=|==|!=|>|<|\(|\)|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|null|[a-zA-Z_][a-zA-Z0-9_.]*|\d+(?:\.\d+)?)\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    tokens.push(m[1]);
  }
  return tokens;
}

function compare(left: any, right: any, op: string): boolean {
  switch (op) {
    case "==":
      if (right === null || left === null) return left == right;
      return left === right;
    case "!=":
      if (right === null || left === null) return left != right;
      return left !== right;
    case ">":
      return Number(left) > Number(right);
    case "<":
      return Number(left) < Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<=":
      return Number(left) <= Number(right);
    default:
      return false;
  }
}

function getPath(obj: Record<string, any>, path: string): any {
  const parts = path.split(".");
  let cur: any = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function isQuoted(token: string): boolean {
  return (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  );
}

function unquote(token: string): string {
  return token
    .slice(1, -1)
    .replace(/\\(["'])/g, '$1')
    .replace(/\\\\/g, '\\');
}

function isNumberToken(token: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(token);
}

function normalizeGlobalSafeguards(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, any>).map(([code, raw]) => {
      const row = raw && typeof raw === "object" ? (raw as Record<string, any>) : {};
      return { code, ...row };
    });
  }
  return [];
}

function asObject(v: unknown): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

function asArray(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
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

function safeText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function numberOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numberOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
