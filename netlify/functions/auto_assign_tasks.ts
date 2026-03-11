import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

type TaskTemplate = {
  id: string;
  key?: string | null;
  title: string;
  description: string;
  default_employee?: string | null;
  default_type?: string | null;
};

type Answers = {
  has_business?: boolean;
  needs_credit_help?: boolean;
  credit_score?: number | string;
  has_derogatories?: boolean;
  interested_in_grants?: boolean;
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRole) {
      return json(500, {
        error: "Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const supabase = createClient(supabaseUrl, serviceRole);

    const body = JSON.parse(event.body || "{}");
    const { tenant_id, user_id, answers } = body as {
      tenant_id?: string;
      user_id?: string;
      answers?: Answers;
    };

    if (!tenant_id || !answers) {
      return json(400, { error: "tenant_id and answers required" });
    }

    const normalizedScore =
      typeof answers.credit_score === "string"
        ? Number(answers.credit_score)
        : answers.credit_score;

    const needsBusiness = answers.has_business === false;
    const needsCredit =
      Boolean(answers.needs_credit_help) ||
      Boolean(normalizedScore) ||
      Boolean(answers.has_derogatories);
    const wantsGrants = Boolean(answers.interested_in_grants);

    const { data: templates, error } = await supabase
      .from("task_templates")
      .select("id,key,title,description,default_employee,default_type");

    if (error) throw error;

    const all = (templates || []) as TaskTemplate[];
    const toCreate: Array<Record<string, unknown>> = [];
    const usedTaskIds = new Set<string>();

    const findTemplate = (keys: string[], titleIncludes: string[]) => {
      const keyHit = all.find((t) => t.key && keys.includes(String(t.key)));
      if (keyHit) return keyHit;
      return all.find((t) =>
        titleIncludes.some((needle) => t.title.toLowerCase().includes(needle))
      );
    };

    const businessTemplate = findTemplate(
      ["form_entity", "setup_infrastructure"],
      ["fundable business", "business entity", "entity"]
    );
    const uploadCreditTemplate = findTemplate(
      ["upload_credit_report"],
      ["upload credit"]
    );
    const creditReviewTemplate = findTemplate(
      ["review_credit_report", "draft_dispute_letters"],
      ["credit report review", "credit optimization", "dispute"]
    );
    const grantTemplate = findTemplate(["grant_match", "grant_narrative"], ["grant"]);
    const staleLeadsTemplate = findTemplate(
      ["reengage_stale_leads"],
      ["stale leads", "re-engage stale leads", "reengage stale leads"]
    );

    if (needsBusiness && businessTemplate) {
      pushUniqueTask(
        toCreate,
        usedTaskIds,
        makeTask(tenant_id, user_id, businessTemplate, {
          status: "pending",
          signal: "red",
        })
      );
    }

    if (needsCredit && uploadCreditTemplate) {
      pushUniqueTask(
        toCreate,
        usedTaskIds,
        makeTask(tenant_id, user_id, uploadCreditTemplate, {
          status: "pending",
          signal: "red",
        })
      );
    }

    if (needsCredit && creditReviewTemplate) {
      pushUniqueTask(
        toCreate,
        usedTaskIds,
        makeTask(tenant_id, user_id, creditReviewTemplate, {
          status: "pending",
          signal: "yellow",
          metadata: {
            source: "onboarding_rule_engine",
            progress: "in_progress",
            credit_score: normalizedScore || null,
            has_derogatories: Boolean(answers.has_derogatories),
          },
        })
      );
    }

    if (wantsGrants && grantTemplate) {
      pushUniqueTask(
        toCreate,
        usedTaskIds,
        makeTask(tenant_id, user_id, grantTemplate, {
          status: "pending",
          signal: "red",
        })
      );
    }

    if (staleLeadsTemplate) {
      pushUniqueTask(
        toCreate,
        usedTaskIds,
        makeTask(tenant_id, user_id, staleLeadsTemplate, {
          status: "pending",
          signal: "yellow",
          assignee: "Ghost Hunter",
        })
      );
    } else if (all.length > 0) {
      pushUniqueTask(
        toCreate,
        usedTaskIds,
        makeAdHocTask(tenant_id, user_id, {
          task_id: "tpl:reengage_stale_leads",
          title: "Re-engage stale leads",
          description: "Ethical follow-up sequences and next-step scheduling.",
          type: "action",
          signal: "yellow",
          assignee: "Ghost Hunter",
        })
      );
    }

    if (!toCreate.length) return json(200, { ok: true, created: 0 });

    const { error: insErr, data: inserted } = await supabase
      .from("client_tasks")
      .upsert(toCreate, { onConflict: "tenant_id,task_id" })
      .select("task_id,title,signal,assigned_employee");

    if (insErr) throw insErr;

    return json(200, {
      ok: true,
      created: inserted?.length || 0,
      tasks: inserted,
    });
  } catch (e: any) {
    return json(400, { error: e?.message || "Bad Request" });
  }
};

function pushUniqueTask(
  list: Array<Record<string, unknown>>,
  usedIds: Set<string>,
  task: Record<string, unknown>
) {
  const id = String(task.task_id || "");
  if (!id || usedIds.has(id)) return;
  usedIds.add(id);
  list.push(task);
}

function makeTask(
  tenant_id: string,
  user_id: string | undefined,
  t: TaskTemplate,
  overrides: {
    status?: "pending" | "completed";
    signal?: "red" | "yellow" | "green";
    assignee?: string;
    metadata?: Record<string, unknown>;
  } = {}
) {
  const due = new Date();
  due.setDate(due.getDate() + 7);
  const taskId = t.key ? `tpl:${t.key}` : `tpl:${slugify(t.title)}`;

  return {
    tenant_id,
    task_id: taskId,
    title: t.title,
    description: t.description,
    status: overrides.status ?? "pending",
    signal: overrides.signal ?? "red",
    due_date: due.toISOString().slice(0, 10),
    type: t.default_type || "action",
    assigned_employee: overrides.assignee || t.default_employee || "Nexus Analyst",
    group_key: null,
    template_key: t.key || null,
    meta: {
      ...(overrides.metadata || {}),
      source: "onboarding_auto_assign",
      user_id: user_id || null,
    },
  };
}

function makeAdHocTask(
  tenant_id: string,
  user_id: string | undefined,
  input: {
    task_id: string;
    title: string;
    description: string;
    type: string;
    signal: "red" | "yellow" | "green";
    assignee: string;
  }
) {
  const due = new Date();
  due.setDate(due.getDate() + 7);
  return {
    tenant_id,
    task_id: input.task_id,
    title: input.title,
    description: input.description,
    status: "pending",
    signal: input.signal,
    due_date: due.toISOString().slice(0, 10),
    type: input.type,
    assigned_employee: input.assignee,
    group_key: "sales",
    template_key: "reengage_stale_leads",
    meta: {
      source: "onboarding_auto_assign",
      user_id: user_id || null,
    },
  };
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
