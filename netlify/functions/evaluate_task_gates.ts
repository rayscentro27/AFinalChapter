import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

type TrainingTask = {
  task_id: string;
  module_id: string;
  task_name: string;
  steps: string[];
  compliance_flags: string[];
};

type TrainingModule = {
  module_id: string;
  module_name: string;
  category: string;
  compliance_level: string;
  mandatory_human_review: boolean;
  prohibited_actions: string[];
  risk_profile?: Record<string, any>;
  ai_lesson: Record<string, any>;
};

type TaskEvidence = {
  evidence_uploaded: boolean;
  verification_flag: boolean;
  human_approved: boolean;
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

    const body = JSON.parse(event.body || "{}");
    const tenantId = safeText(body.tenant_id);
    const userId = safeText(body.user_id);
    const taskId = safeText(body.task_id);

    if (!tenantId || !userId || !taskId) {
      return json(400, { error: "tenant_id, user_id, task_id are required" });
    }

    const supabase = createClient(supabaseUrl, serviceRole);

    const { data: routing, error: routingErr } = await supabase
      .from("cri_routing")
      .select("global_safeguards")
      .eq("singleton_key", "default")
      .maybeSingle();
    if (routingErr) throw routingErr;

    const { data: clientTask, error: clientTaskErr } = await supabase
      .from("client_tasks")
      .select("task_id,title,description,meta,metadata")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("task_id", taskId)
      .maybeSingle();
    if (clientTaskErr) throw clientTaskErr;

    const taskMeta = mergeObject(asObject(clientTask?.meta), asObject(clientTask?.metadata));
    const trainingTaskId =
      safeText(taskMeta.training_task_id) || safeText(clientTask?.task_id) || safeText(taskId);

    const { data: taskRow, error: taskErr } = await supabase
      .from("training_tasks")
      .select("task_id,module_id,task_name,steps,compliance_flags")
      .eq("task_id", trainingTaskId)
      .maybeSingle();
    if (taskErr) throw taskErr;

    const task = (taskRow || {
      task_id: trainingTaskId,
      module_id: safeText(taskMeta.module_id),
      task_name: safeText(clientTask?.title) || trainingTaskId,
      steps: [],
      compliance_flags: [],
    }) as TrainingTask;

    let module: TrainingModule = {
      module_id: safeText(taskMeta.module_id),
      module_name: "",
      category: "",
      compliance_level: safeText(taskMeta.compliance_level) || "standard",
      mandatory_human_review: Boolean(taskMeta?.gates?.human_review_required),
      prohibited_actions: asTextArray(taskMeta?.risk_profile?.prohibited_actions),
      risk_profile: asObject(taskMeta?.risk_profile),
      ai_lesson: {},
    };

    if (task.module_id) {
      const { data: moduleRow, error: moduleErr } = await supabase
        .from("training_modules")
        .select(
          "module_id,module_name,category,compliance_level,mandatory_human_review,prohibited_actions,risk_profile,ai_lesson"
        )
        .eq("module_id", task.module_id)
        .maybeSingle();
      if (moduleErr) throw moduleErr;
      if (moduleRow) {
        module = {
          module_id: moduleRow.module_id,
          module_name: moduleRow.module_name,
          category: moduleRow.category,
          compliance_level: moduleRow.compliance_level,
          mandatory_human_review: Boolean(moduleRow.mandatory_human_review),
          prohibited_actions: asTextArray(moduleRow.prohibited_actions),
          risk_profile: asObject(moduleRow.risk_profile),
          ai_lesson: asObject(moduleRow.ai_lesson),
        };
      }
    }

    const { data: evidenceRow, error: evidenceErr } = await supabase
      .from("task_evidence")
      .select("evidence_uploaded,verification_flag,human_approved")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("task_id", taskId)
      .maybeSingle();
    if (evidenceErr) throw evidenceErr;

    const evidence: TaskEvidence = {
      evidence_uploaded: Boolean(evidenceRow?.evidence_uploaded),
      verification_flag: Boolean(evidenceRow?.verification_flag),
      human_approved: Boolean(evidenceRow?.human_approved),
    };

    const safeguards = normalizeGlobalSafeguards(routing?.global_safeguards);

    const blockers: string[] = [];
    const requiredActions = new Set<string>();

    const taskBlob = [
      task.task_name,
      ...(task.steps || []),
      ...(task.compliance_flags || []),
      String(clientTask?.title || ""),
      String(clientTask?.description || ""),
    ]
      .join(" ")
      .toLowerCase();

    const moduleBlob = [
      module.module_name,
      module.category,
      module.compliance_level,
      ...(asTextArray((module.risk_profile || {}).key_risks) || []),
    ]
      .join(" ")
      .toLowerCase();

    const combinedBlob = (taskBlob + " " + moduleBlob).trim();

    const hasBackdatingContext = /backdat|retroactive claim/.test(combinedBlob);
    const hasDisputeContext = /(dispute|validation|metro2|fdcpa|fcra|collection|identity theft|id theft)/.test(
      combinedBlob
    );
    const humanApprovalFlag = /human approval required|legal-sensitive|legal sensitive/.test(
      (task.compliance_flags || []).join(" ").toLowerCase()
    );
    const moduleRequiresHuman = Boolean(module.mandatory_human_review);
    const legalSensitiveWorkflow =
      moduleRequiresHuman ||
      humanApprovalFlag ||
      /legal-sensitive|legal sensitive|attorney|compliance|critical/.test(combinedBlob);

    const sendingStepDetected = /(submit|send|file|mail|furnish|launch|publish)/.test(taskBlob);
    const leadGenOutreachContext = /(lead gen|lead generation|outreach|cold dm|prospect|re-engage|reengage|campaign|email sequence|sms sequence)/.test(
      combinedBlob
    );

    const explicitFraudAttempt =
      Boolean(taskMeta?.fraud_signal) ||
      Boolean(taskMeta?.gates?.fraud_signal) ||
      false;
    if (safeguardEnabled(safeguards, "SAFE-01") && hasBackdatingContext && !evidence.verification_flag) {
      blockers.push("SAFE-01 blocked: backdating context requires verifiable confirmation.");
      requiredActions.add("Set verification_flag=true in task evidence.");
    }

    if (safeguardEnabled(safeguards, "SAFE-02") && hasDisputeContext && !evidence.evidence_uploaded) {
      blockers.push("SAFE-02 blocked: dispute/validation tasks require evidence upload.");
      requiredActions.add("Upload supporting evidence and set evidence_uploaded=true.");
    }

    if (safeguardEnabled(safeguards, "SAFE-03") && legalSensitiveWorkflow && !evidence.human_approved) {
      blockers.push("SAFE-03 blocked: legal-sensitive workflow requires human approval.");
      requiredActions.add("Human reviewer must approve task (human_approved=true).");
    }

    if (safeguardEnabled(safeguards, "SAFE-04") && explicitFraudAttempt) {
      blockers.push("SAFE-04 blocked: potential fraud enablement detected. Task must be refused and escalated.");
      requiredActions.add("Escalate to Forensic Bot and human compliance reviewer.");
      requiredActions.add("Do not provide operational guidance on prohibited/fraudulent actions.");
    }

    if (
      safeguardEnabled(safeguards, "SAFE-05") &&
      leadGenOutreachContext &&
      sendingStepDetected &&
      (!evidence.evidence_uploaded || !evidence.human_approved)
    ) {
      blockers.push("SAFE-05 blocked: outreach task requires terms/privacy compliance checks before send/submit.");
      requiredActions.add("Provide consent/privacy evidence (evidence_uploaded=true).");
      requiredActions.add("Obtain human approval before outreach send/submit (human_approved=true).");
    }

    if (moduleRequiresHuman && !evidence.human_approved) {
      blockers.push("Module policy requires human review before completion.");
      requiredActions.add("Human approval required by module policy.");
    }

    return json(200, {
      allow_completion: blockers.length === 0,
      blockers,
      required_actions: Array.from(requiredActions),
      task_id: taskId,
      training_task_id: task.task_id,
      module_id: module.module_id || null,
      evidence,
    });
  } catch (e: any) {
    return json(400, {
      error: e?.message || "Bad Request",
      details: typeof e?.details === "string" ? e.details : undefined,
    });
  }
};

function safeguardEnabled(safeguards: any[], code: string): boolean {
  if (!Array.isArray(safeguards) || safeguards.length === 0) return true;

  for (const raw of safeguards) {
    if (typeof raw === "string") {
      if (raw.toUpperCase() === code.toUpperCase()) return true;
      continue;
    }

    if (raw && typeof raw === "object") {
      const c = safeText(raw.code || raw.id || raw.name).toUpperCase();
      if (c === code.toUpperCase()) {
        if (typeof raw.enabled === "boolean") return raw.enabled;
        return true;
      }
    }
  }

  return true;
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

function mergeObject(a: Record<string, any>, b: Record<string, any>): Record<string, any> {
  return { ...a, ...b };
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

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
