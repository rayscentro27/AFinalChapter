import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type WorkflowStatus = "active" | "completed" | "paused";
type Tier = "free" | "growth" | "premium";
type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete";

type StartBody = {
  template_key?: unknown;
  context?: unknown;
  action?: unknown;
};

type AdvanceBody = {
  instance_id?: unknown;
  force?: unknown;
  action?: unknown;
};

type TriggerBody = {
  event_type?: unknown;
  payload?: unknown;
  action?: unknown;
};

type WorkflowTemplateRow = {
  key: string;
  description: string | null;
  steps: unknown;
};

type WorkflowInstanceRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  template_key: string;
  status: WorkflowStatus;
  current_step: number;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type WorkflowStep = {
  order: number;
  key: string;
  title: string;
  required_tier?: Tier;
  requires_ai_consent?: boolean;
  email_event?: string;
  task?: {
    title?: string;
    description?: string;
    type?: "upload" | "action" | "education" | "review" | "meeting" | "legal";
  };
  ai_trigger?: {
    type?: string;
    function?: string;
    path?: string;
    context_key?: string;
    body_key?: string;
  };
};

type SubscriptionRow = {
  tier: string | null;
  plan_code: string | null;
  status: SubscriptionStatus;
};

type ConsentStatusRow = {
  ai_disclosure_accepted?: boolean;
  has_required_consents?: boolean;
};

type WorkflowAccess = {
  canAccess: boolean;
  canManage: boolean;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  growth: 1,
  premium: 2,
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTier(value: unknown): Tier {
  const raw = normalizeString(value).toLowerCase();
  if (raw === "growth") return "growth";
  if (raw === "premium") return "premium";
  return "free";
}

function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  const raw = normalizeString(value).toLowerCase();
  if (raw === "active" || raw === "trialing" || raw === "past_due" || raw === "canceled" || raw === "incomplete") {
    return raw as SubscriptionStatus;
  }
  return "active";
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = normalizeString(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseRoute(pathname: string, action: string): "start" | "advance" | "trigger" | null {
  const normalizedPath = pathname.replace(/\/+$/, "");
  if (normalizedPath.endsWith("/start")) return "start";
  if (normalizedPath.endsWith("/advance")) return "advance";
  if (normalizedPath.endsWith("/trigger")) return "trigger";

  if (action === "start") return "start";
  if (action === "advance") return "advance";
  if (action === "trigger") return "trigger";

  return null;
}

function isActivePaidStatus(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing";
}

function isTierAllowed(currentTier: Tier, currentStatus: SubscriptionStatus, requiredTier: Tier): boolean {
  if (requiredTier === "free") return true;
  if (!isActivePaidStatus(currentStatus)) return false;
  return TIER_RANK[currentTier] >= TIER_RANK[requiredTier];
}

function parseSteps(value: unknown): WorkflowStep[] {
  if (!Array.isArray(value)) return [];

  const steps = value
    .map((item, idx) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const order = Number(row.order ?? idx + 1);
      const key = normalizeString(row.key) || `step_${idx + 1}`;
      const title = normalizeString(row.title) || key.replace(/_/g, " ");
      const requiredTier = normalizeTier(row.required_tier);
      const requiresAiConsent = Boolean(row.requires_ai_consent);
      const taskObj = parseObject(row.task);
      const aiObj = parseObject(row.ai_trigger);

      return {
        order: Number.isFinite(order) && order > 0 ? Math.trunc(order) : idx + 1,
        key,
        title,
        required_tier: requiredTier,
        requires_ai_consent: requiresAiConsent,
        email_event: normalizeString(row.email_event) || undefined,
        task: {
          title: normalizeString(taskObj.title) || undefined,
          description: normalizeString(taskObj.description) || undefined,
          type: (normalizeString(taskObj.type).toLowerCase() as WorkflowStep["task"]["type"]) || "action",
        },
        ai_trigger: Object.keys(aiObj).length > 0
          ? {
            type: normalizeString(aiObj.type) || undefined,
            function: normalizeString(aiObj.function) || undefined,
            path: normalizeString(aiObj.path) || undefined,
            context_key: normalizeString(aiObj.context_key) || undefined,
            body_key: normalizeString(aiObj.body_key) || undefined,
          }
          : undefined,
      } as WorkflowStep;
    })
    .filter((step): step is WorkflowStep => Boolean(step));

  return steps.sort((a, b) => a.order - b.order);
}

async function resolveTenantIdForUser(serviceClient: SupabaseClient, userId: string): Promise<string | null> {
  const preferred = await serviceClient
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!preferred.error && preferred.data?.tenant_id) {
    return String(preferred.data.tenant_id);
  }

  const fallback = await serviceClient
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!fallback.error && (fallback.data as Record<string, unknown> | null)?.tenant_id) {
    return String((fallback.data as Record<string, unknown>).tenant_id);
  }

  const firstTenant = await serviceClient
    .from("tenants")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstTenant.error && firstTenant.data?.id) {
    return String(firstTenant.data.id);
  }

  return null;
}

async function loadTemplate(serviceClient: SupabaseClient, templateKey: string): Promise<WorkflowTemplateRow | null> {
  const direct = await serviceClient
    .from("workflow_templates")
    .select("key,description,steps")
    .eq("key", templateKey)
    .limit(1)
    .maybeSingle();

  if (!direct.error && direct.data) {
    return direct.data as WorkflowTemplateRow;
  }

  const allTemplates = await serviceClient
    .from("workflow_templates")
    .select("key,description,steps")
    .ilike("key", templateKey)
    .limit(1)
    .maybeSingle();

  if (allTemplates.error || !allTemplates.data) return null;
  return allTemplates.data as WorkflowTemplateRow;
}

async function loadInstance(serviceClient: SupabaseClient, instanceId: string): Promise<WorkflowInstanceRow | null> {
  const { data, error } = await serviceClient
    .from("workflow_instances")
    .select("id,tenant_id,user_id,template_key,status,current_step,context,created_at,updated_at")
    .eq("id", instanceId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    ...(data as WorkflowInstanceRow),
    context: parseObject((data as WorkflowInstanceRow).context),
  };
}

async function getWorkflowAccess(userClient: SupabaseClient, instance: WorkflowInstanceRow, userId: string): Promise<WorkflowAccess> {
  const own = instance.user_id === userId;
  if (own) return { canAccess: true, canManage: true };

  const accessRes = await userClient.rpc("nexus_workflow_can_access_tenant", { p_tenant_id: instance.tenant_id });
  const canAccess = !accessRes.error && Boolean(accessRes.data);

  const manageRes = await userClient.rpc("nexus_workflow_can_manage_tenant", { p_tenant_id: instance.tenant_id });
  const canManage = !manageRes.error && Boolean(manageRes.data);

  return {
    canAccess,
    canManage,
  };
}

async function getUserTierState(serviceClient: SupabaseClient, userId: string, tenantId: string): Promise<{ tier: Tier; status: SubscriptionStatus }> {
  const { data } = await serviceClient
    .from("subscriptions")
    .select("tier,plan_code,status")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { tier: "free", status: "active" };
  }

  const row = data as SubscriptionRow;
  return {
    tier: normalizeTier(row.tier || row.plan_code),
    status: normalizeSubscriptionStatus(row.status),
  };
}

async function getAiConsentState(serviceClient: SupabaseClient, userId: string): Promise<boolean> {
  const statusRes = await serviceClient
    .from("user_consent_status")
    .select("ai_disclosure_accepted,has_required_consents")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!statusRes.error && statusRes.data) {
    const row = statusRes.data as ConsentStatusRow;
    return Boolean(row.ai_disclosure_accepted && row.has_required_consents);
  }

  const fallback = await serviceClient
    .from("consents")
    .select("id")
    .eq("user_id", userId)
    .eq("consent_type", "ai_disclosure")
    .order("accepted_at", { ascending: false })
    .limit(1);

  return !fallback.error && Array.isArray(fallback.data) && fallback.data.length > 0;
}

async function insertWorkflowEvent(serviceClient: SupabaseClient, instanceId: string, eventType: string, payload: Record<string, unknown>) {
  await serviceClient.from("workflow_events").insert({
    instance_id: instanceId,
    event_type: eventType,
    payload,
  });
}

async function writeAuditEvent(serviceClient: SupabaseClient, params: {
  tenantId: string;
  actorUserId: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
}) {
  const firstTry = await serviceClient.from("audit_events").insert({
    tenant_id: params.tenantId,
    actor_user_id: params.actorUserId,
    event_type: params.eventType,
    metadata: params.metadata,
  });

  if (!firstTry.error) return;

  await serviceClient.from("audit_events").insert({
    tenant_id: params.tenantId,
    actor_user_id: params.actorUserId,
    actor_type: "system",
    action: params.eventType,
    entity_type: "workflow",
    entity_id: String(params.metadata.instance_id || "workflow"),
    metadata: params.metadata,
  });
}

async function getUserEmail(serviceClient: SupabaseClient, userId: string): Promise<{ email: string | null; name: string | null }> {
  const userRes = await serviceClient.auth.admin.getUserById(userId);
  if (userRes.error || !userRes.data.user) {
    return { email: null, name: null };
  }

  const user = userRes.data.user;
  return {
    email: normalizeString(user.email).toLowerCase() || null,
    name: normalizeString(user.user_metadata?.name) || null,
  };
}

async function sendEmailViaOrchestrator(params: {
  authHeader: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  userId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  templateKey: string;
  data?: Record<string, unknown>;
}) {
  const endpoint = `${params.supabaseUrl.replace(/\/+$/, "")}/functions/v1/email-orchestrator/send`;

  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": params.authHeader,
      "apikey": params.supabaseAnonKey,
    },
    body: JSON.stringify({
      message_type: "transactional",
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      template_key: params.templateKey,
      data: params.data || {},
      user_id: params.userId,
    }),
  });
}

async function createStepTask(params: {
  serviceClient: SupabaseClient;
  instance: WorkflowInstanceRow;
  template: WorkflowTemplateRow;
  step: WorkflowStep;
}) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 3);
  const dueDateIso = dueDate.toISOString().slice(0, 10);

  const taskId = `wf:${params.instance.id}:${params.step.order}`;
  const taskMeta = {
    source: "workflow_engine",
    workflow_instance_id: params.instance.id,
    workflow_template_key: params.template.key,
    workflow_step_number: params.step.order,
    workflow_step_key: params.step.key,
  };

  const insertPayload: Record<string, unknown> = {
    tenant_id: params.instance.tenant_id,
    task_id: taskId,
    title: normalizeString(params.step.task?.title) || params.step.title,
    description: normalizeString(params.step.task?.description) || `${params.template.key}: ${params.step.title}`,
    status: "pending",
    due_date: dueDateIso,
    type: params.step.task?.type || "action",
    signal: "yellow",
    assigned_employee: "Workflow Engine",
    group_key: "workflow",
    template_key: `${params.template.key}.${params.step.key}`,
    workflow_instance_id: params.instance.id,
    workflow_step_number: params.step.order,
    workflow_step_key: params.step.key,
    link: null,
    meeting_time: null,
    linked_to_goal: true,
    meta: taskMeta,
  };

  const { error } = await params.serviceClient
    .from("client_tasks")
    .upsert(insertPayload, { onConflict: "tenant_id,task_id" });

  if (error) {
    throw new Error(error.message || "Unable to create workflow step task.");
  }

  return taskId;
}

async function isCurrentStepTaskCompleted(serviceClient: SupabaseClient, instance: WorkflowInstanceRow): Promise<boolean> {
  const { data, error } = await serviceClient
    .from("client_tasks")
    .select("status")
    .eq("tenant_id", instance.tenant_id)
    .eq("workflow_instance_id", instance.id)
    .eq("workflow_step_number", instance.current_step)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;
  return normalizeString((data as { status?: unknown }).status).toLowerCase() === "completed";
}

async function maybeRunAiTrigger(params: {
  authHeader: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  instance: WorkflowInstanceRow;
  step: WorkflowStep;
}): Promise<{ contextPatch: Record<string, unknown>; outcome: string }> {
  const aiTrigger = params.step.ai_trigger;
  if (!aiTrigger) {
    return { contextPatch: {}, outcome: "not_configured" };
  }

  const fn = normalizeString(aiTrigger.function);
  if (!fn) {
    return {
      contextPatch: {
        last_ai_trigger_type: normalizeString(aiTrigger.type) || null,
        last_ai_triggered_at: new Date().toISOString(),
      },
      outcome: "tracked_only",
    };
  }

  const contextKey = normalizeString(aiTrigger.context_key) || "sanitized_facts_id";
  const bodyKey = normalizeString(aiTrigger.body_key) || contextKey;
  const contextValue = params.instance.context?.[contextKey];

  if (!contextValue) {
    return {
      contextPatch: {
        last_ai_trigger_error: `missing_context_${contextKey}`,
        last_ai_triggered_at: new Date().toISOString(),
      },
      outcome: "skipped_missing_context",
    };
  }

  const path = normalizeString(aiTrigger.path) || "run";
  const endpoint = `${params.supabaseUrl.replace(/\/+$/, "")}/functions/v1/${fn}/${path}`;
  const body = {
    [bodyKey]: contextValue,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": params.authHeader,
      "apikey": params.supabaseAnonKey,
    },
    body: JSON.stringify(body),
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = parseObject(await response.json());
  } catch {
    payload = {};
  }

  if (!response.ok) {
    return {
      contextPatch: {
        last_ai_trigger_error: normalizeString(payload.error) || `http_${response.status}`,
        last_ai_triggered_at: new Date().toISOString(),
      },
      outcome: "failed",
    };
  }

  return {
    contextPatch: {
      last_ai_trigger_type: normalizeString(aiTrigger.type) || fn,
      last_ai_trigger_function: fn,
      last_ai_triggered_at: new Date().toISOString(),
      last_ai_trigger_response: payload,
    },
    outcome: "success",
  };
}

async function enforceStepGate(params: {
  serviceClient: SupabaseClient;
  instance: WorkflowInstanceRow;
  step: WorkflowStep;
}): Promise<void> {
  const requiredTier = params.step.required_tier || "free";
  const tierState = await getUserTierState(params.serviceClient, params.instance.user_id, params.instance.tenant_id);

  if (!isTierAllowed(tierState.tier, tierState.status, requiredTier)) {
    throw new Error(`Tier gate blocked step ${params.step.key}. Required tier: ${requiredTier}.`);
  }

  if (params.step.requires_ai_consent) {
    const hasAiConsent = await getAiConsentState(params.serviceClient, params.instance.user_id);
    if (!hasAiConsent) {
      throw new Error(`Consent gate blocked step ${params.step.key}. AI disclosure acceptance is required.`);
    }
  }
}

async function advanceInstance(params: {
  serviceClient: SupabaseClient;
  userClient: SupabaseClient;
  authHeader: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  actorUserId: string;
  instanceId: string;
  force: boolean;
}): Promise<{ instance: WorkflowInstanceRow; next_step: WorkflowStep | null; completed: boolean }> {
  const instance = await loadInstance(params.serviceClient, params.instanceId);
  if (!instance) {
    throw new Error("Workflow instance not found.");
  }

  const access = await getWorkflowAccess(params.userClient, instance, params.actorUserId);
  if (!access.canAccess) {
    throw new Error("Unauthorized workflow access.");
  }

  if (instance.status === "completed") {
    throw new Error("Workflow already completed.");
  }

  if (instance.status === "paused") {
    throw new Error("Workflow is paused.");
  }

  if (!params.force) {
    const completed = await isCurrentStepTaskCompleted(params.serviceClient, instance);
    if (!completed) {
      throw new Error("Current step task must be completed before advancing.");
    }
  } else if (!access.canManage) {
    throw new Error("Only tenant admins can force-advance workflow instances.");
  }

  const template = await loadTemplate(params.serviceClient, instance.template_key);
  if (!template) {
    throw new Error("Workflow template not found.");
  }

  const steps = parseSteps(template.steps);
  if (!steps.length) {
    throw new Error("Workflow template has no steps.");
  }

  const currentStep = steps.find((step) => step.order === instance.current_step) || steps[instance.current_step - 1];

  await insertWorkflowEvent(params.serviceClient, instance.id, "workflow.step_completed", {
    step_number: currentStep?.order || instance.current_step,
    step_key: currentStep?.key || null,
    forced: params.force,
    actor_user_id: params.actorUserId,
  });

  const nextStepNumber = instance.current_step + 1;
  const nextStep = steps.find((step) => step.order === nextStepNumber) || null;

  if (!nextStep) {
    const updateRes = await params.serviceClient
      .from("workflow_instances")
      .update({
        status: "completed",
        current_step: steps.length,
        context: {
          ...instance.context,
          completed_at: new Date().toISOString(),
          completed_by: params.actorUserId,
        },
      })
      .eq("id", instance.id)
      .select("id,tenant_id,user_id,template_key,status,current_step,context,created_at,updated_at")
      .single();

    if (updateRes.error || !updateRes.data) {
      throw new Error(updateRes.error?.message || "Unable to complete workflow.");
    }

    await insertWorkflowEvent(params.serviceClient, instance.id, "workflow.completed", {
      actor_user_id: params.actorUserId,
      template_key: instance.template_key,
    });

    await writeAuditEvent(params.serviceClient, {
      tenantId: instance.tenant_id,
      actorUserId: params.actorUserId,
      eventType: "workflow.completed",
      metadata: {
        instance_id: instance.id,
        template_key: instance.template_key,
      },
    });

    const recipient = await getUserEmail(params.serviceClient, instance.user_id);
    if (recipient.email) {
      await sendEmailViaOrchestrator({
        authHeader: params.authHeader,
        supabaseUrl: params.supabaseUrl,
        supabaseAnonKey: params.supabaseAnonKey,
        userId: instance.user_id,
        to: recipient.email,
        subject: `Workflow completed: ${instance.template_key}`,
        html: `<p>Your workflow <strong>${instance.template_key}</strong> is complete.</p><p>Educational workflow updates only. Results vary.</p>`,
        text: `Your workflow ${instance.template_key} is complete. Educational workflow updates only. Results vary.`,
        templateKey: "workflow_completed",
        data: {
          instance_id: instance.id,
          template_key: instance.template_key,
        },
      });
    }

    return {
      instance: {
        ...(updateRes.data as WorkflowInstanceRow),
        context: parseObject((updateRes.data as WorkflowInstanceRow).context),
      },
      next_step: null,
      completed: true,
    };
  }

  await enforceStepGate({
    serviceClient: params.serviceClient,
    instance,
    step: nextStep,
  });

  const aiRun = await maybeRunAiTrigger({
    authHeader: params.authHeader,
    supabaseUrl: params.supabaseUrl,
    supabaseAnonKey: params.supabaseAnonKey,
    instance,
    step: nextStep,
  });

  const nextContext = {
    ...instance.context,
    last_transition_at: new Date().toISOString(),
    last_transition_by: params.actorUserId,
    last_completed_step: currentStep?.key || null,
    ...aiRun.contextPatch,
  };

  const updateRes = await params.serviceClient
    .from("workflow_instances")
    .update({
      current_step: nextStep.order,
      status: "active",
      context: nextContext,
    })
    .eq("id", instance.id)
    .select("id,tenant_id,user_id,template_key,status,current_step,context,created_at,updated_at")
    .single();

  if (updateRes.error || !updateRes.data) {
    throw new Error(updateRes.error?.message || "Unable to advance workflow step.");
  }

  const updatedInstance: WorkflowInstanceRow = {
    ...(updateRes.data as WorkflowInstanceRow),
    context: parseObject((updateRes.data as WorkflowInstanceRow).context),
  };

  const createdTaskId = await createStepTask({
    serviceClient: params.serviceClient,
    instance: updatedInstance,
    template,
    step: nextStep,
  });

  await insertWorkflowEvent(params.serviceClient, updatedInstance.id, "workflow.step_started", {
    step_number: nextStep.order,
    step_key: nextStep.key,
    task_id: createdTaskId,
    ai_outcome: aiRun.outcome,
  });

  await writeAuditEvent(params.serviceClient, {
    tenantId: updatedInstance.tenant_id,
    actorUserId: params.actorUserId,
    eventType: "workflow.advanced",
    metadata: {
      instance_id: updatedInstance.id,
      from_step: currentStep?.order || instance.current_step,
      to_step: nextStep.order,
      step_key: nextStep.key,
      ai_outcome: aiRun.outcome,
      forced: params.force,
    },
  });

  const recipient = await getUserEmail(params.serviceClient, updatedInstance.user_id);
  if (recipient.email) {
    await sendEmailViaOrchestrator({
      authHeader: params.authHeader,
      supabaseUrl: params.supabaseUrl,
      supabaseAnonKey: params.supabaseAnonKey,
      userId: updatedInstance.user_id,
      to: recipient.email,
      subject: `Workflow milestone: ${template.key} - ${nextStep.title}`,
      html: `<p>You reached a workflow milestone: <strong>${nextStep.title}</strong>.</p><p>Educational workflow updates only. Results vary.</p>`,
      text: `You reached workflow milestone ${nextStep.title}. Educational workflow updates only. Results vary.`,
      templateKey: "workflow_milestone",
      data: {
        instance_id: updatedInstance.id,
        template_key: template.key,
        step_key: nextStep.key,
        step_number: nextStep.order,
      },
    });
  }

  return {
    instance: updatedInstance,
    next_step: nextStep,
    completed: false,
  };
}

async function handleStart(req: Request, body: StartBody): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(500, { error: "Supabase environment is not configured." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Missing bearer token." });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const authRes = await userClient.auth.getUser();
  const authUserId = authRes.data.user?.id || null;
  if (authRes.error || !authUserId) {
    return json(401, { error: "Unauthorized." });
  }

  const templateKey = normalizeString(body.template_key).toUpperCase();
  if (!templateKey) {
    return json(400, { error: "template_key is required." });
  }

  const template = await loadTemplate(serviceClient, templateKey);
  if (!template) {
    return json(404, { error: "Workflow template not found." });
  }

  const steps = parseSteps(template.steps);
  if (!steps.length) {
    return json(400, { error: "Workflow template has no steps." });
  }

  const tenantId = await resolveTenantIdForUser(serviceClient, authUserId);
  if (!tenantId) {
    return json(400, { error: "Unable to resolve tenant context." });
  }

  const firstStep = steps[0];
  const initialInstance = {
    tenant_id: tenantId,
    user_id: authUserId,
    template_key: template.key,
    status: "active" as WorkflowStatus,
    current_step: firstStep.order,
    context: {
      ...parseObject(body.context),
      started_at: new Date().toISOString(),
      started_by: authUserId,
    },
  };

  const insertRes = await serviceClient
    .from("workflow_instances")
    .insert(initialInstance)
    .select("id,tenant_id,user_id,template_key,status,current_step,context,created_at,updated_at")
    .single();

  if (insertRes.error || !insertRes.data) {
    return json(400, { error: insertRes.error?.message || "Unable to create workflow instance." });
  }

  const instance: WorkflowInstanceRow = {
    ...(insertRes.data as WorkflowInstanceRow),
    context: parseObject((insertRes.data as WorkflowInstanceRow).context),
  };

  try {
    await enforceStepGate({
      serviceClient,
      instance,
      step: firstStep,
    });
  } catch (error) {
    await serviceClient.from("workflow_instances").delete().eq("id", instance.id);
    return json(403, { error: error instanceof Error ? error.message : "Workflow gate failed." });
  }

  const taskId = await createStepTask({
    serviceClient,
    instance,
    template,
    step: firstStep,
  });

  await insertWorkflowEvent(serviceClient, instance.id, "workflow.started", {
    template_key: template.key,
    step_number: firstStep.order,
    step_key: firstStep.key,
    task_id: taskId,
    actor_user_id: authUserId,
  });

  await writeAuditEvent(serviceClient, {
    tenantId,
    actorUserId: authUserId,
    eventType: "workflow.started",
    metadata: {
      instance_id: instance.id,
      template_key: template.key,
      step_key: firstStep.key,
      step_number: firstStep.order,
      task_id: taskId,
    },
  });

  const recipient = await getUserEmail(serviceClient, authUserId);
  if (recipient.email) {
    await sendEmailViaOrchestrator({
      authHeader,
      supabaseUrl,
      supabaseAnonKey,
      userId: authUserId,
      to: recipient.email,
      subject: `Workflow started: ${template.key}`,
      html: `<p>Your workflow <strong>${template.key}</strong> has started.</p><p>Current step: ${firstStep.title}</p><p>Educational workflow updates only. Results vary.</p>`,
      text: `Your workflow ${template.key} has started. Current step: ${firstStep.title}.`,
      templateKey: "workflow_started",
      data: {
        instance_id: instance.id,
        template_key: template.key,
        step_key: firstStep.key,
        step_number: firstStep.order,
      },
    });
  }

  return json(200, {
    success: true,
    instance,
    current_step: firstStep,
    task_id: taskId,
  });
}

async function handleAdvance(req: Request, body: AdvanceBody): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(500, { error: "Supabase environment is not configured." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Missing bearer token." });
  }

  const instanceId = normalizeString(body.instance_id);
  if (!instanceId) {
    return json(400, { error: "instance_id is required." });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const authRes = await userClient.auth.getUser();
  const authUserId = authRes.data.user?.id || null;
  if (authRes.error || !authUserId) {
    return json(401, { error: "Unauthorized." });
  }

  try {
    const result = await advanceInstance({
      serviceClient,
      userClient,
      authHeader,
      supabaseUrl,
      supabaseAnonKey,
      actorUserId: authUserId,
      instanceId,
      force: parseBoolean(body.force),
    });

    return json(200, {
      success: true,
      instance: result.instance,
      next_step: result.next_step,
      completed: result.completed,
    });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Unable to advance workflow." });
  }
}

async function handleTrigger(req: Request, body: TriggerBody): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(500, { error: "Supabase environment is not configured." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Missing bearer token." });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const authRes = await userClient.auth.getUser();
  const authUserId = authRes.data.user?.id || null;
  if (authRes.error || !authUserId) {
    return json(401, { error: "Unauthorized." });
  }

  const eventType = normalizeString(body.event_type).toLowerCase();
  const payload = parseObject(body.payload);

  if (!eventType) {
    return json(400, { error: "event_type is required." });
  }

  const instanceId = normalizeString(payload.instance_id);

  if (eventType === "task.completed" || eventType === "workflow.advance") {
    if (!instanceId) return json(400, { error: "payload.instance_id is required." });

    try {
      const result = await advanceInstance({
        serviceClient,
        userClient,
        authHeader,
        supabaseUrl,
        supabaseAnonKey,
        actorUserId: authUserId,
        instanceId,
        force: false,
      });

      return json(200, {
        success: true,
        event_type: eventType,
        instance: result.instance,
        next_step: result.next_step,
        completed: result.completed,
      });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "Workflow advance trigger failed." });
    }
  }

  if (eventType === "workflow.force_advance") {
    if (!instanceId) return json(400, { error: "payload.instance_id is required." });

    try {
      const result = await advanceInstance({
        serviceClient,
        userClient,
        authHeader,
        supabaseUrl,
        supabaseAnonKey,
        actorUserId: authUserId,
        instanceId,
        force: true,
      });

      return json(200, {
        success: true,
        event_type: eventType,
        instance: result.instance,
        next_step: result.next_step,
        completed: result.completed,
      });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "Workflow force advance failed." });
    }
  }

  if (eventType === "workflow.pause" || eventType === "workflow.resume") {
    if (!instanceId) return json(400, { error: "payload.instance_id is required." });

    const instance = await loadInstance(serviceClient, instanceId);
    if (!instance) return json(404, { error: "Workflow instance not found." });

    const access = await getWorkflowAccess(userClient, instance, authUserId);
    if (!access.canManage) {
      return json(403, { error: "Tenant admin access required." });
    }

    const nextStatus: WorkflowStatus = eventType === "workflow.pause" ? "paused" : "active";

    const updateRes = await serviceClient
      .from("workflow_instances")
      .update({ status: nextStatus })
      .eq("id", instance.id)
      .select("id,tenant_id,user_id,template_key,status,current_step,context,created_at,updated_at")
      .single();

    if (updateRes.error || !updateRes.data) {
      return json(400, { error: updateRes.error?.message || "Unable to update workflow status." });
    }

    await insertWorkflowEvent(serviceClient, instance.id, eventType, {
      actor_user_id: authUserId,
      status: nextStatus,
      payload,
    });

    await writeAuditEvent(serviceClient, {
      tenantId: instance.tenant_id,
      actorUserId: authUserId,
      eventType,
      metadata: {
        instance_id: instance.id,
        status: nextStatus,
      },
    });

    return json(200, {
      success: true,
      event_type: eventType,
      instance: {
        ...(updateRes.data as WorkflowInstanceRow),
        context: parseObject((updateRes.data as WorkflowInstanceRow).context),
      },
    });
  }

  if (eventType === "document.ready" || eventType === "subscription.change") {
    const targetUserId = normalizeString(payload.user_id) || authUserId;
    const recipient = await getUserEmail(serviceClient, targetUserId);
    if (!recipient.email) {
      return json(400, { error: "Unable to resolve recipient email." });
    }

    const subject = eventType === "document.ready"
      ? "Your workflow document is ready"
      : "Subscription status update";

    const summary = eventType === "document.ready"
      ? "A workflow document is now ready for your review."
      : "Your subscription record has been updated.";

    await sendEmailViaOrchestrator({
      authHeader,
      supabaseUrl,
      supabaseAnonKey,
      userId: targetUserId,
      to: recipient.email,
      subject,
      html: `<p>${summary}</p><p>Educational workflow updates only. Results vary.</p>`,
      text: `${summary} Educational workflow updates only. Results vary.`,
      templateKey: eventType === "document.ready" ? "workflow_document_ready" : "workflow_subscription_change",
      data: payload,
    });

    if (instanceId) {
      await insertWorkflowEvent(serviceClient, instanceId, eventType, {
        actor_user_id: authUserId,
        payload,
      });
    }

    return json(200, {
      success: true,
      event_type: eventType,
    });
  }

  if (instanceId) {
    await insertWorkflowEvent(serviceClient, instanceId, eventType, {
      actor_user_id: authUserId,
      payload,
    });
  }

  return json(200, {
    success: true,
    event_type: eventType,
    stored: Boolean(instanceId),
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const action = normalizeString(body.action).toLowerCase();
  const route = parseRoute(new URL(req.url).pathname, action);

  if (!route) {
    return json(404, { error: "Route not found." });
  }

  if (route === "start") {
    return handleStart(req, body as StartBody);
  }

  if (route === "advance") {
    return handleAdvance(req, body as AdvanceBody);
  }

  return handleTrigger(req, body as TriggerBody);
});
