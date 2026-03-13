import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type RouteAction = "tick" | "enroll" | "aggregate-daily" | "link-signup" | "offer-click";

type TickBody = {
  action?: unknown;
  limit?: unknown;
  tenant_id?: unknown;
};

type EnrollBody = {
  action?: unknown;
  lead_id?: unknown;
  sequence_key?: unknown;
};

type AggregateBody = {
  action?: unknown;
  day?: unknown;
  days_back?: unknown;
  tenant_id?: unknown;
};

type LinkSignupBody = {
  action?: unknown;
  email?: unknown;
};

type OfferClickBody = {
  action?: unknown;
  offer_inbox_id?: unknown;
};

type EnrollmentRow = {
  id: string;
  tenant_id: string;
  lead_id: string;
  sequence_id: string;
  status: "enrolled" | "paused" | "completed" | "canceled";
  current_step: number;
  last_error: string | null;
};

type LeadRow = {
  id: string;
  tenant_id: string | null;
  email: string;
  status: string;
  marketing_opt_in: boolean;
  marketing_opt_in_consent_id?: string | null;
  first_name: string | null;
  last_name: string | null;
};

type StepRow = {
  id: string;
  sequence_id: string;
  step_order: number;
  wait_minutes: number;
  action_type: "SEND_EMAIL" | "TAG_LEAD" | "START_WORKFLOW" | "CREATE_TASK" | "SHOW_OFFER" | "NOOP";
  action_payload: Record<string, unknown>;
};

type SequenceRow = {
  id: string;
  key: string;
  tenant_id: string;
  is_active: boolean;
};

type ProcessingResult = {
  enrollment_id: string;
  status: "processed" | "completed" | "skipped" | "failed";
  message: string;
  step_order?: number;
};

type MetricsBucket = {
  tenant_id: string;
  day: string;
  visitors: number;
  leads_set: Set<string>;
  optins_set: Set<string>;
  signups_set: Set<string>;
  upgrades_growth: number;
  upgrades_premium: number;
  outcomes_approved: number;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
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

function normalizeEmail(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toPositiveInt(value: unknown, fallback: number, max = 500): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.trunc(n);
  if (rounded <= 0) return fallback;
  return Math.min(rounded, max);
}

function parseRoute(pathname: string, action: string): RouteAction | null {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith("/tick")) return "tick";
  if (normalized.endsWith("/enroll")) return "enroll";
  if (normalized.endsWith("/aggregate-daily")) return "aggregate-daily";
  if (normalized.endsWith("/link-signup")) return "link-signup";
  if (normalized.endsWith("/offer-click")) return "offer-click";

  if (normalized.endsWith("/funnel-engine")) {
    if (action === "tick") return "tick";
    if (action === "enroll") return "enroll";
    if (action === "aggregate-daily") return "aggregate-daily";
    if (action === "link-signup") return "link-signup";
    if (action === "offer-click") return "offer-click";
  }

  return null;
}

function dayKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function addMinutes(date: Date, minutes: number): string {
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.trunc(minutes)) : 0;
  return new Date(date.getTime() + safe * 60 * 1000).toISOString();
}

function addBackoffMinutes(date: Date, lastError: string | null): string {
  const attempts = (() => {
    const raw = normalizeString(lastError);
    const match = raw.match(/attempt=(\d{1,3})/);
    if (!match) return 1;
    return Math.max(1, Math.min(16, Number(match[1]) + 1));
  })();

  const wait = Math.min(240, 5 * attempts);
  return addMinutes(date, wait);
}

function withAttempt(errorMessage: string, lastError: string | null): string {
  const current = normalizeString(lastError);
  const match = current.match(/attempt=(\d{1,3})/);
  const attempt = match ? Math.max(1, Math.min(99, Number(match[1]) + 1)) : 1;
  return `attempt=${attempt}; ${errorMessage}`.slice(0, 1000);
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

async function canManageTenant(userClient: SupabaseClient, serviceClient: SupabaseClient, userId: string, tenantId: string): Promise<boolean> {
  const rpc = await userClient.rpc("nexus_funnel_can_manage_tenant", {
    p_tenant_id: tenantId,
  });

  if (!rpc.error && Boolean(rpc.data)) {
    return true;
  }

  const membership = await serviceClient
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (!membership.error && membership.data?.role) {
    const role = normalizeString(membership.data.role).toLowerCase();
    if (["owner", "admin", "super_admin"].includes(role)) {
      return true;
    }
  }

  const legacy = await serviceClient
    .from("tenant_members")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (!legacy.error && (legacy.data as Record<string, unknown> | null)?.role) {
    const role = normalizeString((legacy.data as Record<string, unknown>).role).toLowerCase();
    if (["owner", "admin", "super_admin"].includes(role)) {
      return true;
    }
  }

  return false;
}

async function getLinkedUserId(serviceClient: SupabaseClient, tenantId: string, leadId: string): Promise<string | null> {
  const row = await serviceClient
    .from("lead_user_links")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .limit(1)
    .maybeSingle();

  if (row.error || !row.data?.user_id) return null;
  return String(row.data.user_id);
}

function hasProofField(value: unknown): boolean {
  return normalizeString(value).length > 0;
}

async function hasLeadMarketingConsentProof(serviceClient: SupabaseClient, tenantId: string, leadId: string): Promise<boolean> {
  const eventRes = await serviceClient
    .from("lead_events")
    .select("payload")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .eq("event_type", "OPTIN_CONFIRMED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eventRes.error || !eventRes.data) return false;

  const payload = asObject(eventRes.data.payload);
  if (hasProofField(payload.consent_id)) return true;

  const proof = asObject(payload.consent_proof);
  const snapshot = asObject(payload.consent_snapshot);

  const acceptedAt = normalizeString(proof.accepted_at || snapshot.accepted_at);
  const commsVersion = normalizeString(proof.comms_required_version || snapshot.comms_required_version);

  return Boolean(acceptedAt && commsVersion);
}

async function ensureUnsubscribeToken(serviceClient: SupabaseClient, leadId: string): Promise<string | null> {
  const existing = await serviceClient
    .from("unsubscribe_tokens")
    .select("token")
    .eq("lead_id", leadId)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing.error && existing.data?.token) {
    return String(existing.data.token);
  }

  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const insert = await serviceClient
    .from("unsubscribe_tokens")
    .insert({
      token,
      lead_id: leadId,
      expires_at: expiresAt,
    });

  if (insert.error) {
    return null;
  }

  return token;
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
    entity_type: "funnel",
    entity_id: String(params.metadata.enrollment_id || params.metadata.lead_id || "funnel"),
    metadata: params.metadata,
  });
}

async function insertLeadEvent(serviceClient: SupabaseClient, params: {
  tenantId: string;
  leadId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  await serviceClient.from("lead_events").insert({
    tenant_id: params.tenantId,
    lead_id: params.leadId,
    event_type: params.eventType,
    payload: params.payload || {},
  });
}

async function callFunction(params: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  authHeader: string;
  fnName: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> }> {
  const endpoint = `${params.supabaseUrl.replace(/\/+$/, "")}/functions/v1/${params.fnName}${params.path}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": params.authHeader,
      "apikey": params.supabaseAnonKey,
    },
    body: JSON.stringify(params.body),
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = asObject(await response.json());
  } catch {
    payload = {};
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function upsertEnrollment(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  leadId: string;
  sequenceId: string;
  firstWaitMinutes: number;
}): Promise<string> {
  const now = new Date();
  const nextRunAt = addMinutes(now, Math.max(0, params.firstWaitMinutes));

  const upsert = await params.serviceClient
    .from("funnel_enrollments")
    .upsert({
      tenant_id: params.tenantId,
      lead_id: params.leadId,
      sequence_id: params.sequenceId,
      status: "enrolled",
      current_step: 0,
      next_run_at: nextRunAt,
      last_error: null,
    }, { onConflict: "lead_id,sequence_id" })
    .select("id")
    .single();

  if (upsert.error || !upsert.data?.id) {
    throw new Error(upsert.error?.message || "Unable to enroll lead.");
  }

  return String(upsert.data.id);
}

async function loadSequenceByKey(serviceClient: SupabaseClient, key: string): Promise<SequenceRow | null> {
  const row = await serviceClient
    .from("funnel_sequences")
    .select("id,key,tenant_id,is_active")
    .eq("key", key)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (row.error || !row.data) return null;
  return row.data as SequenceRow;
}

async function loadStep(serviceClient: SupabaseClient, sequenceId: string, stepOrder: number): Promise<StepRow | null> {
  const row = await serviceClient
    .from("funnel_steps")
    .select("id,sequence_id,step_order,wait_minutes,action_type,action_payload")
    .eq("sequence_id", sequenceId)
    .eq("step_order", stepOrder)
    .limit(1)
    .maybeSingle();

  if (row.error || !row.data) return null;
  return {
    ...(row.data as StepRow),
    action_payload: asObject((row.data as StepRow).action_payload),
  };
}

async function loadFirstStepWait(serviceClient: SupabaseClient, sequenceId: string): Promise<number> {
  const firstStep = await loadStep(serviceClient, sequenceId, 1);
  if (!firstStep) return 0;
  return Math.max(0, Number(firstStep.wait_minutes || 0));
}

async function isMarketingSequence(serviceClient: SupabaseClient, sequenceId: string): Promise<boolean> {
  const rows = await serviceClient
    .from("funnel_steps")
    .select("action_type,action_payload")
    .eq("sequence_id", sequenceId)
    .limit(1000);

  if (rows.error || !Array.isArray(rows.data)) return false;

  return rows.data.some((row) => {
    const actionType = normalizeString((row as Record<string, unknown>).action_type).toUpperCase();
    if (actionType !== "SEND_EMAIL") return false;
    const payload = asObject((row as Record<string, unknown>).action_payload);
    const messageType = normalizeString(payload.message_type).toLowerCase();
    return messageType === "marketing" || messageType === "newsletter";
  });
}

function buildTaskPayload(input: {
  tenantId: string;
  userId: string;
  enrollmentId: string;
  stepOrder: number;
  stepPayload: Record<string, unknown>;
}) {
  const dueDays = Math.max(0, toPositiveInt(input.stepPayload.due_days, 2, 365));
  const due = new Date();
  due.setDate(due.getDate() + dueDays);
  const dueDate = due.toISOString().slice(0, 10);

  const title = normalizeString(input.stepPayload.title) || "Workflow task";
  const description = normalizeString(input.stepPayload.description) || "Complete the next educational workflow action.";
  const typeRaw = normalizeString(input.stepPayload.type).toLowerCase();
  const type = ["upload", "action", "education", "review", "meeting", "legal"].includes(typeRaw)
    ? typeRaw
    : "action";

  return {
    tenant_id: input.tenantId,
    task_id: `funnel:${input.enrollmentId}:${input.stepOrder}`,
    user_id: input.userId,
    title,
    description,
    status: "pending",
    due_date: dueDate,
    due_at: null,
    type,
    signal: "yellow",
    assigned_employee: "Funnel Engine",
    assignee_agent: "Funnel Engine",
    group_key: "funnel",
    template_key: normalizeString(input.stepPayload.task_key) || `funnel_step_${input.stepOrder}`,
    workflow_instance_id: null,
    workflow_step_number: null,
    workflow_step_key: null,
    link: null,
    meeting_time: null,
    linked_to_goal: false,
    meta: {
      source: "funnel_engine",
      enrollment_id: input.enrollmentId,
      step_order: input.stepOrder,
    },
    metadata: {
      source: "funnel_engine",
      enrollment_id: input.enrollmentId,
      step_order: input.stepOrder,
    },
  };
}

async function executeStep(params: {
  serviceClient: SupabaseClient;
  supabaseUrl: string;
  supabaseAnonKey: string;
  authHeader: string;
  enrollment: EnrollmentRow;
  lead: LeadRow;
  step: StepRow;
  actorUserId: string;
}) {
  const actionPayload = params.step.action_payload || {};
  const linkedUserId = await getLinkedUserId(params.serviceClient, params.enrollment.tenant_id, params.enrollment.lead_id);

  if (params.step.action_type === "SEND_EMAIL") {
    const messageType = normalizeString(actionPayload.message_type).toLowerCase() || "marketing";
    const isMarketing = messageType === "marketing" || messageType === "newsletter";
    const hasConsentId = Boolean(params.lead.marketing_opt_in_consent_id);
    const hasDurableProof = isMarketing
      ? await hasLeadMarketingConsentProof(params.serviceClient, params.enrollment.tenant_id, params.enrollment.lead_id)
      : false;
    const hasMarketingConsentProof = Boolean(params.lead.marketing_opt_in && (hasConsentId || hasDurableProof));

    if (isMarketing) {
      if (!params.lead.marketing_opt_in || params.lead.status === "unsubscribed") {
        await insertLeadEvent(params.serviceClient, {
          tenantId: params.enrollment.tenant_id,
          leadId: params.enrollment.lead_id,
          eventType: "EMAIL_SKIPPED",
          payload: {
            reason: "marketing_opt_in_missing_or_unsubscribed",
            step_order: params.step.step_order,
          },
        });
        return { message: "Marketing email skipped due to opt-in/unsubscribe state." };
      }

      const contactRes = await params.serviceClient
        .from("esp_contacts")
        .select("unsubscribed")
        .eq("tenant_id", params.enrollment.tenant_id)
        .eq("email", normalizeEmail(params.lead.email))
        .limit(1)
        .maybeSingle();

      if (!contactRes.error && contactRes.data?.unsubscribed) {
        await insertLeadEvent(params.serviceClient, {
          tenantId: params.enrollment.tenant_id,
          leadId: params.enrollment.lead_id,
          eventType: "EMAIL_SKIPPED",
          payload: {
            reason: "esp_unsubscribed",
            step_order: params.step.step_order,
          },
        });
        return { message: "Marketing email skipped due to global unsubscribe." };
      }

      if (!hasMarketingConsentProof) {
        await insertLeadEvent(params.serviceClient, {
          tenantId: params.enrollment.tenant_id,
          leadId: params.enrollment.lead_id,
          eventType: "EMAIL_SKIPPED",
          payload: {
            reason: "marketing_consent_proof_missing",
            step_order: params.step.step_order,
          },
        });
        return { message: "Marketing email skipped due to missing consent proof." };
      }
    }

    const appUrl = normalizeString(Deno.env.get("PUBLIC_APP_URL")) || "https://app.nexus.local";
    const unsubscribeToken = isMarketing
      ? await ensureUnsubscribeToken(params.serviceClient, params.enrollment.lead_id)
      : null;
    const unsubscribeUrl = unsubscribeToken ? `${appUrl.replace(/\/+$/, "")}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}` : null;

    const subject = normalizeString(actionPayload.subject) || "Nexus educational update";
    const htmlBase = normalizeString(actionPayload.html) || "<p>Educational update from Nexus.</p>";
    const textBase = normalizeString(actionPayload.text) || "Educational update from Nexus.";

    const legalLinks = `<p style=\"font-size:12px;color:#64748b\">Educational only. No guarantees. <a href=\"${appUrl}/privacy\">Privacy</a> • <a href=\"${appUrl}/disclaimers\">Disclaimers</a>${unsubscribeUrl ? ` • <a href=\"${unsubscribeUrl}\">Unsubscribe</a>` : ""}</p>`;

    const sendRes = await callFunction({
      supabaseUrl: params.supabaseUrl,
      supabaseAnonKey: params.supabaseAnonKey,
      authHeader: params.authHeader,
      fnName: "email-orchestrator",
      path: "/send",
      body: {
        tenant_id: params.enrollment.tenant_id,
        message_type: isMarketing ? "marketing" : "transactional",
        to: normalizeEmail(params.lead.email),
        subject,
        html: `${htmlBase}${legalLinks}`,
        text: `${textBase}\n\nEducational only. No guarantees.\nPrivacy: ${appUrl}/privacy\nDisclaimers: ${appUrl}/disclaimers${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ""}`,
        template_key: normalizeString(actionPayload.template_key) || null,
        user_id: linkedUserId || null,
        consent_marketing: isMarketing ? hasMarketingConsentProof : false,
        comms_email_accepted: isMarketing ? hasMarketingConsentProof : false,
        data: {
          source: "funnel_engine",
          enrollment_id: params.enrollment.id,
          lead_id: params.enrollment.lead_id,
          step_order: params.step.step_order,
        },
      },
    });

    if (!sendRes.ok) {
      throw new Error(normalizeString(sendRes.payload.error) || `email_orchestrator_failed_${sendRes.status}`);
    }

    await insertLeadEvent(params.serviceClient, {
      tenantId: params.enrollment.tenant_id,
      leadId: params.enrollment.lead_id,
      eventType: "EMAIL_SENT",
      payload: {
        step_order: params.step.step_order,
        message_type: isMarketing ? "marketing" : "transactional",
        message_id: sendRes.payload.message_id || null,
        provider: sendRes.payload.provider || null,
      },
    });

    return { message: "Email sent." };
  }

  if (params.step.action_type === "TAG_LEAD") {
    const nextStatus = normalizeString(actionPayload.status).toLowerCase() || "nurturing";
    await params.serviceClient
      .from("leads")
      .update({ status: nextStatus })
      .eq("id", params.enrollment.lead_id);

    await insertLeadEvent(params.serviceClient, {
      tenantId: params.enrollment.tenant_id,
      leadId: params.enrollment.lead_id,
      eventType: "LEAD_TAGGED",
      payload: {
        step_order: params.step.step_order,
        status: nextStatus,
      },
    });

    return { message: "Lead tagged." };
  }

  if (params.step.action_type === "START_WORKFLOW") {
    if (!linkedUserId) {
      await insertLeadEvent(params.serviceClient, {
        tenantId: params.enrollment.tenant_id,
        leadId: params.enrollment.lead_id,
        eventType: "WORKFLOW_SKIPPED",
        payload: {
          step_order: params.step.step_order,
          reason: "lead_not_linked_to_user",
        },
      });
      return { message: "Workflow skipped because lead is not linked to a user." };
    }

    const templateKey = normalizeString(actionPayload.template_key) || "FUNDING_ONBOARDING";
    const startRes = await callFunction({
      supabaseUrl: params.supabaseUrl,
      supabaseAnonKey: params.supabaseAnonKey,
      authHeader: params.authHeader,
      fnName: "workflow-engine",
      path: "/start",
      body: {
        template_key: templateKey,
        user_id: linkedUserId,
        tenant_id: params.enrollment.tenant_id,
        context: {
          source: "funnel_engine",
          lead_id: params.enrollment.lead_id,
          enrollment_id: params.enrollment.id,
        },
      },
    });

    if (!startRes.ok) {
      throw new Error(normalizeString(startRes.payload.error) || `workflow_start_failed_${startRes.status}`);
    }

    await insertLeadEvent(params.serviceClient, {
      tenantId: params.enrollment.tenant_id,
      leadId: params.enrollment.lead_id,
      eventType: "WORKFLOW_STARTED",
      payload: {
        step_order: params.step.step_order,
        template_key: templateKey,
        instance_id: startRes.payload.instance ? asObject(startRes.payload.instance).id || null : null,
      },
    });

    return { message: "Workflow started." };
  }

  if (params.step.action_type === "CREATE_TASK") {
    if (!linkedUserId) {
      await insertLeadEvent(params.serviceClient, {
        tenantId: params.enrollment.tenant_id,
        leadId: params.enrollment.lead_id,
        eventType: "TASK_SKIPPED",
        payload: {
          step_order: params.step.step_order,
          reason: "lead_not_linked_to_user",
        },
      });
      return { message: "Task skipped because lead is not linked to a user." };
    }

    const taskPayload = buildTaskPayload({
      tenantId: params.enrollment.tenant_id,
      userId: linkedUserId,
      enrollmentId: params.enrollment.id,
      stepOrder: params.step.step_order,
      stepPayload: actionPayload,
    });

    const taskInsert = await params.serviceClient
      .from("client_tasks")
      .upsert(taskPayload, { onConflict: "tenant_id,task_id" });

    if (taskInsert.error) {
      throw new Error(taskInsert.error.message || "Unable to create funnel task.");
    }

    await insertLeadEvent(params.serviceClient, {
      tenantId: params.enrollment.tenant_id,
      leadId: params.enrollment.lead_id,
      eventType: "TASK_CREATED",
      payload: {
        step_order: params.step.step_order,
        task_id: String(taskPayload.task_id),
      },
    });

    return { message: "Task created." };
  }

  if (params.step.action_type === "SHOW_OFFER") {
    if (!linkedUserId) {
      await insertLeadEvent(params.serviceClient, {
        tenantId: params.enrollment.tenant_id,
        leadId: params.enrollment.lead_id,
        eventType: "OFFER_SKIPPED",
        payload: {
          step_order: params.step.step_order,
          reason: "lead_not_linked_to_user",
        },
      });
      return { message: "Offer skipped because lead is not linked to a user." };
    }

    const offerKey = normalizeString(actionPayload.offer_key) || "upgrade_growth_v1";
    const offerInsert = await params.serviceClient
      .from("offers_inbox")
      .insert({
        tenant_id: params.enrollment.tenant_id,
        user_id: linkedUserId,
        offer_key: offerKey,
        status: "unseen",
      })
      .select("id")
      .maybeSingle();

    if (offerInsert.error) {
      throw new Error(offerInsert.error.message || "Unable to create offer notification.");
    }

    await insertLeadEvent(params.serviceClient, {
      tenantId: params.enrollment.tenant_id,
      leadId: params.enrollment.lead_id,
      eventType: "OFFER_SHOWN",
      payload: {
        step_order: params.step.step_order,
        offer_key: offerKey,
        offer_inbox_id: offerInsert.data?.id || null,
      },
    });

    return { message: "Offer notification created." };
  }

  await insertLeadEvent(params.serviceClient, {
    tenantId: params.enrollment.tenant_id,
    leadId: params.enrollment.lead_id,
    eventType: "STEP_NOOP",
    payload: {
      step_order: params.step.step_order,
    },
  });

  return { message: "No action executed." };
}

async function processEnrollment(params: {
  serviceClient: SupabaseClient;
  supabaseUrl: string;
  supabaseAnonKey: string;
  authHeader: string;
  enrollment: EnrollmentRow;
  actorUserId: string;
}): Promise<ProcessingResult> {
  const now = new Date();

  const leadRes = await params.serviceClient
    .from("leads")
    .select("id,tenant_id,email,status,marketing_opt_in,marketing_opt_in_consent_id,first_name,last_name")
    .eq("id", params.enrollment.lead_id)
    .limit(1)
    .maybeSingle();

  if (leadRes.error || !leadRes.data) {
    await params.serviceClient
      .from("funnel_enrollments")
      .update({
        status: "canceled",
        last_error: "lead_not_found",
      })
      .eq("id", params.enrollment.id);

    return {
      enrollment_id: params.enrollment.id,
      status: "failed",
      message: "Lead not found; enrollment canceled.",
    };
  }

  const lead = leadRes.data as LeadRow;

  const stepOrder = Math.max(1, Number(params.enrollment.current_step || 0) + 1);
  const step = await loadStep(params.serviceClient, params.enrollment.sequence_id, stepOrder);

  if (!step) {
    await params.serviceClient
      .from("funnel_enrollments")
      .update({
        status: "completed",
        current_step: Math.max(0, Number(params.enrollment.current_step || 0)),
        next_run_at: now.toISOString(),
        last_error: null,
      })
      .eq("id", params.enrollment.id);

    await insertLeadEvent(params.serviceClient, {
      tenantId: params.enrollment.tenant_id,
      leadId: params.enrollment.lead_id,
      eventType: "SEQUENCE_COMPLETED",
      payload: {
        enrollment_id: params.enrollment.id,
      },
    });

    await writeAuditEvent(params.serviceClient, {
      tenantId: params.enrollment.tenant_id,
      actorUserId: params.actorUserId,
      eventType: "funnel.sequence_completed",
      metadata: {
        enrollment_id: params.enrollment.id,
        lead_id: params.enrollment.lead_id,
      },
    });

    return {
      enrollment_id: params.enrollment.id,
      status: "completed",
      message: "Sequence completed.",
    };
  }

  try {
    const execution = await executeStep({
      serviceClient: params.serviceClient,
      supabaseUrl: params.supabaseUrl,
      supabaseAnonKey: params.supabaseAnonKey,
      authHeader: params.authHeader,
      enrollment: params.enrollment,
      lead,
      step,
      actorUserId: params.actorUserId,
    });

    const followingStep = await loadStep(params.serviceClient, params.enrollment.sequence_id, step.step_order + 1);
    const isFinished = !followingStep;

    await params.serviceClient
      .from("funnel_enrollments")
      .update({
        current_step: step.step_order,
        status: isFinished ? "completed" : "enrolled",
        next_run_at: isFinished ? now.toISOString() : addMinutes(now, Number(followingStep.wait_minutes || 0)),
        last_error: null,
      })
      .eq("id", params.enrollment.id);

    await writeAuditEvent(params.serviceClient, {
      tenantId: params.enrollment.tenant_id,
      actorUserId: params.actorUserId,
      eventType: "funnel.step_executed",
      metadata: {
        enrollment_id: params.enrollment.id,
        lead_id: params.enrollment.lead_id,
        step_order: step.step_order,
        action_type: step.action_type,
        completed: isFinished,
      },
    });

    return {
      enrollment_id: params.enrollment.id,
      status: isFinished ? "completed" : "processed",
      message: execution.message,
      step_order: step.step_order,
    };
  } catch (error) {
    const message = normalizeString((error as Error)?.message || error);
    const nextError = withAttempt(message || "step_execution_failed", params.enrollment.last_error);

    await params.serviceClient
      .from("funnel_enrollments")
      .update({
        status: "enrolled",
        last_error: nextError,
        next_run_at: addBackoffMinutes(now, params.enrollment.last_error),
      })
      .eq("id", params.enrollment.id);

    await writeAuditEvent(params.serviceClient, {
      tenantId: params.enrollment.tenant_id,
      actorUserId: params.actorUserId,
      eventType: "funnel.step_failed",
      metadata: {
        enrollment_id: params.enrollment.id,
        lead_id: params.enrollment.lead_id,
        step_order: step.step_order,
        action_type: step.action_type,
        error: message || "step_execution_failed",
      },
    });

    return {
      enrollment_id: params.enrollment.id,
      status: "failed",
      message: message || "Step execution failed.",
      step_order: step.step_order,
    };
  }
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, "=");
    const decoded = atob(padded);
    const payload = JSON.parse(decoded);
    return asObject(payload);
  } catch {
    return null;
  }
}

function isServiceRoleBearerToken(token: string, serviceRoleKey: string): boolean {
  if (serviceRoleKey && token === serviceRoleKey) return true;

  const payload = parseJwtPayload(token);
  const role = normalizeString(payload?.role).toLowerCase();
  return role === "service_role";
}

async function requireAuthContext(req: Request, supabaseUrl: string, supabaseAnonKey: string, serviceRoleKey: string) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false as const, error: "Missing bearer token." };
  }

  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const isServiceRole = isServiceRoleBearerToken(bearerToken, serviceRoleKey);

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  if (isServiceRole) {
    return {
      ok: true as const,
      authHeader,
      userClient,
      userId: "00000000-0000-0000-0000-000000000000",
      userEmail: "",
      isServiceRole: true,
    };
  }

  const authRes = await userClient.auth.getUser();
  if (authRes.error || !authRes.data.user?.id) {
    return { ok: false as const, error: "Unauthorized." };
  }

  return {
    ok: true as const,
    authHeader,
    userClient,
    userId: String(authRes.data.user.id),
    userEmail: normalizeEmail(authRes.data.user.email || null),
    isServiceRole: false,
  };
}

async function handleEnroll(body: EnrollBody, serviceClient: SupabaseClient, authContext: {
  userClient: SupabaseClient;
  userId: string;
}) {
  const leadId = normalizeString(body.lead_id);
  const sequenceKey = normalizeString(body.sequence_key);

  if (!leadId || !sequenceKey) {
    return json(400, { success: false, error: "lead_id and sequence_key are required." });
  }

  const leadRes = await serviceClient
    .from("leads")
    .select("id,tenant_id,email,status,marketing_opt_in,marketing_opt_in_consent_id")
    .eq("id", leadId)
    .limit(1)
    .maybeSingle();

  if (leadRes.error || !leadRes.data) {
    return json(404, { success: false, error: "Lead not found." });
  }

  const lead = leadRes.data as LeadRow;
  if (!lead.tenant_id) {
    return json(400, { success: false, error: "Lead tenant is missing." });
  }

  const canManage = await canManageTenant(authContext.userClient, serviceClient, authContext.userId, lead.tenant_id);
  const linkedUserId = await getLinkedUserId(serviceClient, lead.tenant_id, lead.id);
  const isSelfLinked = linkedUserId === authContext.userId;

  if (!canManage && !isSelfLinked) {
    return json(403, { success: false, error: "Not authorized to enroll this lead." });
  }

  const sequence = await loadSequenceByKey(serviceClient, sequenceKey);
  if (!sequence || sequence.tenant_id !== lead.tenant_id) {
    return json(404, { success: false, error: "Sequence not found for tenant." });
  }

  const marketingSequence = await isMarketingSequence(serviceClient, sequence.id);
  if (marketingSequence && (!lead.marketing_opt_in || lead.status === "unsubscribed")) {
    return json(403, { success: false, error: "Lead must be marketing opted-in and not unsubscribed for this sequence." });
  }

  const firstWait = await loadFirstStepWait(serviceClient, sequence.id);
  const enrollmentId = await upsertEnrollment({
    serviceClient,
    tenantId: lead.tenant_id,
    leadId,
    sequenceId: sequence.id,
    firstWaitMinutes: firstWait,
  });

  await insertLeadEvent(serviceClient, {
    tenantId: lead.tenant_id,
    leadId,
    eventType: "SEQUENCE_ENROLLED",
    payload: {
      enrollment_id: enrollmentId,
      sequence_key: sequence.key,
      actor_user_id: authContext.userId,
    },
  });

  await writeAuditEvent(serviceClient, {
    tenantId: lead.tenant_id,
    actorUserId: authContext.userId,
    eventType: "funnel.enrolled",
    metadata: {
      enrollment_id: enrollmentId,
      lead_id: leadId,
      sequence_key: sequence.key,
    },
  });

  return json(200, {
    success: true,
    enrollment_id: enrollmentId,
  });
}

async function handleTick(body: TickBody, serviceClient: SupabaseClient, authContext: {
  authHeader: string;
  userClient: SupabaseClient;
  userId: string;
  isServiceRole: boolean;
}, supabaseUrl: string, supabaseAnonKey: string) {
  const limit = toPositiveInt(body.limit, 20, 100);
  const tenantFilter = normalizeString(body.tenant_id) || null;

  let query = serviceClient
    .from("funnel_enrollments")
    .select("id,tenant_id,lead_id,sequence_id,status,current_step,last_error")
    .eq("status", "enrolled")
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (tenantFilter) {
    query = query.eq("tenant_id", tenantFilter);
  }

  const rows = await query;
  if (rows.error) {
    return json(400, { success: false, error: rows.error.message || "Unable to load enrollments." });
  }

  const enrollments = (rows.data || []) as EnrollmentRow[];
  const manageCache = new Map<string, boolean>();
  const results: ProcessingResult[] = [];

  for (const enrollment of enrollments) {
    let canManage = manageCache.get(enrollment.tenant_id);
    if (canManage === undefined) {
      canManage = authContext.isServiceRole
        ? true
        : await canManageTenant(authContext.userClient, serviceClient, authContext.userId, enrollment.tenant_id);
      manageCache.set(enrollment.tenant_id, canManage);
    }

    if (!canManage) {
      results.push({
        enrollment_id: enrollment.id,
        status: "skipped",
        message: "Skipped: actor cannot manage tenant.",
      });
      continue;
    }

    const result = await processEnrollment({
      serviceClient,
      supabaseUrl,
      supabaseAnonKey,
      authHeader: authContext.authHeader,
      enrollment,
      actorUserId: authContext.userId,
    });

    results.push(result);
  }

  return json(200, {
    success: true,
    processed: results.length,
    results,
  });
}

function getOrCreateBucket(map: Map<string, MetricsBucket>, tenantId: string, day: string): MetricsBucket {
  const key = `${tenantId}:${day}`;
  const existing = map.get(key);
  if (existing) return existing;

  const created: MetricsBucket = {
    tenant_id: tenantId,
    day,
    visitors: 0,
    leads_set: new Set<string>(),
    optins_set: new Set<string>(),
    signups_set: new Set<string>(),
    upgrades_growth: 0,
    upgrades_premium: 0,
    outcomes_approved: 0,
  };

  map.set(key, created);
  return created;
}

async function handleAggregateDaily(body: AggregateBody, serviceClient: SupabaseClient, authContext: {
  userClient: SupabaseClient;
  userId: string;
  isServiceRole: boolean;
}) {
  const now = new Date();
  const baseDay = normalizeString(body.day) ? new Date(`${normalizeString(body.day)}T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!Number.isFinite(baseDay.getTime())) {
    return json(400, { success: false, error: "Invalid day format." });
  }

  const daysBack = Math.max(0, toPositiveInt(body.days_back, 1, 30) - 1);
  const start = new Date(baseDay.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const end = new Date(baseDay.getTime() + 24 * 60 * 60 * 1000);
  const tenantFilter = normalizeString(body.tenant_id) || null;

  if (tenantFilter && !authContext.isServiceRole) {
    const allowed = await canManageTenant(authContext.userClient, serviceClient, authContext.userId, tenantFilter);
    if (!allowed) {
      return json(403, { success: false, error: "Not authorized for tenant metrics aggregation." });
    }
  }

  let eventsQuery = serviceClient
    .from("lead_events")
    .select("tenant_id,lead_id,event_type,payload,created_at")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true })
    .limit(20000);

  if (tenantFilter) {
    eventsQuery = eventsQuery.eq("tenant_id", tenantFilter);
  }

  const eventsRes = await eventsQuery;
  if (eventsRes.error) {
    return json(400, { success: false, error: eventsRes.error.message || "Unable to load lead events." });
  }

  const buckets = new Map<string, MetricsBucket>();

  for (const row of (eventsRes.data || []) as Array<Record<string, unknown>>) {
    const tenantId = normalizeString(row.tenant_id);
    const leadId = normalizeString(row.lead_id);
    const eventType = normalizeString(row.event_type).toUpperCase();
    const payload = asObject(row.payload);
    const day = dayKey(String(row.created_at || now.toISOString()));

    if (!tenantId || !day) continue;

    const bucket = getOrCreateBucket(buckets, tenantId, day);

    if (eventType === "LEAD_CREATED") {
      bucket.visitors += 1;
      if (leadId) bucket.leads_set.add(leadId);
    } else if (eventType === "OPTIN_CONFIRMED") {
      if (leadId) bucket.optins_set.add(leadId);
    } else if (eventType === "SIGNUP_COMPLETED") {
      if (leadId) bucket.signups_set.add(leadId);
    } else if (eventType === "UPGRADED") {
      const tier = normalizeString(payload.tier || payload.target_tier).toLowerCase();
      if (tier === "growth") bucket.upgrades_growth += 1;
      if (tier === "premium") bucket.upgrades_premium += 1;
    } else if (eventType === "OUTCOME_REPORTED") {
      const status = normalizeString(payload.outcome_status).toLowerCase();
      if (status === "approved") bucket.outcomes_approved += 1;
    }
  }

  let outcomesQuery = serviceClient
    .from("funding_outcomes")
    .select("tenant_id,outcome_status,approval_date,updated_at")
    .eq("outcome_status", "approved")
    .gte("updated_at", start.toISOString())
    .lt("updated_at", end.toISOString())
    .limit(20000);

  if (tenantFilter) {
    outcomesQuery = outcomesQuery.eq("tenant_id", tenantFilter);
  }

  const outcomesRes = await outcomesQuery;
  if (!outcomesRes.error && Array.isArray(outcomesRes.data)) {
    for (const row of outcomesRes.data as Array<Record<string, unknown>>) {
      const tenantId = normalizeString(row.tenant_id);
      if (!tenantId) continue;
      const day = row.approval_date
        ? normalizeString(row.approval_date)
        : dayKey(String(row.updated_at || now.toISOString()));
      if (!day) continue;

      const bucket = getOrCreateBucket(buckets, tenantId, day);
      bucket.outcomes_approved += 1;
    }
  }

  const upserts = Array.from(buckets.values()).map((bucket) => ({
    tenant_id: bucket.tenant_id,
    day: bucket.day,
    visitors: bucket.visitors,
    leads: bucket.leads_set.size,
    optins: bucket.optins_set.size,
    signups: bucket.signups_set.size,
    upgrades_growth: bucket.upgrades_growth,
    upgrades_premium: bucket.upgrades_premium,
    outcomes_approved: bucket.outcomes_approved,
  }));

  if (upserts.length > 0) {
    const upsertRes = await serviceClient
      .from("funnel_metrics_daily")
      .upsert(upserts, { onConflict: "tenant_id,day" });

    if (upsertRes.error) {
      return json(400, { success: false, error: upsertRes.error.message || "Unable to write funnel metrics." });
    }
  }

  return json(200, {
    success: true,
    days_processed: Array.from(new Set(upserts.map((row) => row.day))).length,
    row_count: upserts.length,
  });
}

async function handleLinkSignup(body: LinkSignupBody, serviceClient: SupabaseClient, authContext: {
  userId: string;
  userEmail: string;
}) {
  const email = normalizeEmail(body.email || authContext.userEmail);
  if (!email) {
    return json(400, { success: false, error: "No email available for lead linkage." });
  }

  const tenantId = await resolveTenantIdForUser(serviceClient, authContext.userId);
  if (!tenantId) {
    return json(400, { success: false, error: "Unable to resolve tenant for signup linkage." });
  }

  let leadRes = await serviceClient
    .from("leads")
    .select("id,tenant_id,email,status,marketing_opt_in,marketing_opt_in_consent_id")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leadRes.error || !leadRes.data) {
    leadRes = await serviceClient
      .from("leads")
      .select("id,tenant_id,email,status,marketing_opt_in,marketing_opt_in_consent_id")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  if (leadRes.error || !leadRes.data) {
    return json(200, {
      success: true,
      linked: false,
      message: "No matching lead found for this email.",
    });
  }

  const lead = leadRes.data as LeadRow;
  const effectiveTenant = normalizeString(lead.tenant_id) || tenantId;

  const linkRes = await serviceClient
    .from("lead_user_links")
    .upsert({
      tenant_id: effectiveTenant,
      lead_id: lead.id,
      user_id: authContext.userId,
    }, { onConflict: "tenant_id,lead_id" });

  if (linkRes.error) {
    return json(400, { success: false, error: linkRes.error.message || "Unable to link lead to user." });
  }

  await serviceClient
    .from("leads")
    .update({
      status: "converted",
    })
    .eq("id", lead.id);

  if (lead.marketing_opt_in && !lead.marketing_opt_in_consent_id) {
    const commsVersionRes = await serviceClient
      .from("consent_requirements")
      .select("current_version")
      .eq("consent_type", "comms_email")
      .limit(1)
      .maybeSingle();

    const commsVersion = normalizeString(commsVersionRes.data?.current_version) || "v1";

    let policyVersionId: string | null = null;
    const commsPolicyDoc = await serviceClient
      .from("policy_documents")
      .select("id")
      .eq("key", "comms_email")
      .limit(1)
      .maybeSingle();

    if (!commsPolicyDoc.error && commsPolicyDoc.data?.id) {
      const policyVersion = await serviceClient
        .from("policy_versions")
        .select("id")
        .eq("document_id", String(commsPolicyDoc.data.id))
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!policyVersion.error && policyVersion.data?.id) {
        policyVersionId = String(policyVersion.data.id);
      }
    }

    const consentRes = await serviceClient
      .from("consents")
      .upsert({
        user_id: authContext.userId,
        tenant_id: effectiveTenant,
        consent_type: "comms_email",
        version: commsVersion,
        accepted_at: new Date().toISOString(),
        ip_hash: null,
        user_agent: "funnel_link_signup",
        policy_version_id: policyVersionId,
        metadata: {
          source: "lead_capture_link_signup",
          carried_from_lead_id: lead.id,
        },
      }, { onConflict: "user_id,consent_type,version" })
      .select("id")
      .single();

    if (!consentRes.error && consentRes.data?.id) {
      await serviceClient
        .from("leads")
        .update({
          marketing_opt_in_consent_id: String(consentRes.data.id),
        })
        .eq("id", lead.id);
    }

    await serviceClient
      .from("esp_contacts")
      .upsert({
        tenant_id: effectiveTenant,
        user_id: authContext.userId,
        email,
        consent_transactional: true,
        consent_marketing: true,
        unsubscribed: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,email" });
  }

  const existingSignupEvent = await serviceClient
    .from("lead_events")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("event_type", "SIGNUP_COMPLETED")
    .contains("payload", { user_id: authContext.userId })
    .limit(1)
    .maybeSingle();

  if (existingSignupEvent.error || !existingSignupEvent.data) {
    await insertLeadEvent(serviceClient, {
      tenantId: effectiveTenant,
      leadId: lead.id,
      eventType: "SIGNUP_COMPLETED",
      payload: {
        user_id: authContext.userId,
      },
    });
  }

  const onboarding = await loadSequenceByKey(serviceClient, "onboarding_transactional_v1");
  let enrollmentId: string | null = null;
  if (onboarding && onboarding.tenant_id === effectiveTenant) {
    const firstWait = await loadFirstStepWait(serviceClient, onboarding.id);
    enrollmentId = await upsertEnrollment({
      serviceClient,
      tenantId: effectiveTenant,
      leadId: lead.id,
      sequenceId: onboarding.id,
      firstWaitMinutes: firstWait,
    });
  }

  await writeAuditEvent(serviceClient, {
    tenantId: effectiveTenant,
    actorUserId: authContext.userId,
    eventType: "funnel.signup_linked",
    metadata: {
      lead_id: lead.id,
      enrollment_id: enrollmentId,
    },
  });

  return json(200, {
    success: true,
    linked: true,
    lead_id: lead.id,
    onboarding_enrollment_id: enrollmentId,
  });
}

async function handleOfferClick(body: OfferClickBody, serviceClient: SupabaseClient, authContext: {
  userId: string;
}) {
  const offerInboxId = normalizeString(body.offer_inbox_id);
  if (!offerInboxId) {
    return json(400, { success: false, error: "offer_inbox_id is required." });
  }

  const row = await serviceClient
    .from("offers_inbox")
    .select("id,tenant_id,user_id,offer_key,status")
    .eq("id", offerInboxId)
    .limit(1)
    .maybeSingle();

  if (row.error || !row.data) {
    return json(404, { success: false, error: "Offer record not found." });
  }

  const offer = row.data as Record<string, unknown>;
  if (normalizeString(offer.user_id) !== authContext.userId) {
    return json(403, { success: false, error: "Not authorized for this offer." });
  }

  await serviceClient
    .from("offers_inbox")
    .update({
      status: "clicked",
    })
    .eq("id", offerInboxId);

  const leadLink = await serviceClient
    .from("lead_user_links")
    .select("lead_id")
    .eq("tenant_id", normalizeString(offer.tenant_id))
    .eq("user_id", authContext.userId)
    .order("linked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!leadLink.error && leadLink.data?.lead_id) {
    await insertLeadEvent(serviceClient, {
      tenantId: normalizeString(offer.tenant_id),
      leadId: String(leadLink.data.lead_id),
      eventType: "UPGRADE_CLICKED",
      payload: {
        offer_key: normalizeString(offer.offer_key),
        offer_inbox_id: offerInboxId,
      },
    });
  }

  await writeAuditEvent(serviceClient, {
    tenantId: normalizeString(offer.tenant_id),
    actorUserId: authContext.userId,
    eventType: "funnel.offer_clicked",
    metadata: {
      offer_inbox_id: offerInboxId,
      offer_key: normalizeString(offer.offer_key),
    },
  });

  return json(200, {
    success: true,
    offer_inbox_id: offerInboxId,
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method not allowed." });
  }

  const supabaseUrl = normalizeString(Deno.env.get("SUPABASE_URL"));
  const supabaseAnonKey = normalizeString(Deno.env.get("SUPABASE_ANON_KEY"));
  const serviceRoleKey = normalizeString(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(500, { success: false, error: "Supabase environment is not configured." });
  }

  let body: Record<string, unknown> = {};
  try {
    body = asObject(await req.json());
  } catch {
    body = {};
  }

  const route = parseRoute(new URL(req.url).pathname, normalizeString(body.action).toLowerCase());
  if (!route) {
    return json(404, { success: false, error: "Route not found." });
  }

  const authContext = await requireAuthContext(req, supabaseUrl, supabaseAnonKey, serviceRoleKey);
  if (!authContext.ok) {
    return json(401, { success: false, error: authContext.error });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (route === "enroll") {
      return await handleEnroll(body as EnrollBody, serviceClient, {
        userClient: authContext.userClient,
        userId: authContext.userId,
      });
    }

    if (route === "tick") {
      return await handleTick(body as TickBody, serviceClient, {
        authHeader: authContext.authHeader,
        userClient: authContext.userClient,
        userId: authContext.userId,
        isServiceRole: authContext.isServiceRole,
      }, supabaseUrl, supabaseAnonKey);
    }

    if (route === "aggregate-daily") {
      return await handleAggregateDaily(body as AggregateBody, serviceClient, {
        userClient: authContext.userClient,
        userId: authContext.userId,
        isServiceRole: authContext.isServiceRole,
      });
    }

    if (route === "link-signup") {
      return await handleLinkSignup(body as LinkSignupBody, serviceClient, {
        userId: authContext.userId,
        userEmail: authContext.userEmail,
      });
    }

    return await handleOfferClick(body as OfferClickBody, serviceClient, {
      userId: authContext.userId,
    });
  } catch (error) {
    return json(400, {
      success: false,
      error: normalizeString((error as Error)?.message || error),
    });
  }
});
