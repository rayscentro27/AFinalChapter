import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type RouteAction = "create" | "generate-pack" | "update-milestone" | "tick-reminders";
type Tier = "free" | "growth" | "premium";
type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete";

type CreateBody = {
  client_file_id?: unknown;
  target_amount_cents?: unknown;
  target_timeline_months?: unknown;
  action?: unknown;
};

type GeneratePackBody = {
  plan_id?: unknown;
  action?: unknown;
};

type UpdateMilestoneBody = {
  plan_id?: unknown;
  milestone_key?: unknown;
  status?: unknown;
  action?: unknown;
};

type TickRemindersBody = {
  plan_id?: unknown;
  action?: unknown;
};

type PlanRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  client_file_id: string;
  status: string;
  target_amount_cents: number | null;
  target_timeline_months: number | null;
  readiness_score: number;
  milestones: unknown;
  created_at: string;
  updated_at: string;
};

type RequiredDocRow = {
  key: string;
  title: string;
  description_md: string;
};

type SubscriptionRow = {
  tier?: string | null;
  plan_code?: string | null;
  status?: string | null;
};

type Milestone = {
  key: string;
  title: string;
  due_date: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  completed_at?: string;
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

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function normalizeTier(value: unknown): Tier {
  const raw = normalizeString(value).toLowerCase();
  if (raw === "premium") return "premium";
  if (raw === "growth") return "growth";
  return "free";
}

function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  const raw = normalizeString(value).toLowerCase();
  if (raw === "active" || raw === "trialing" || raw === "past_due" || raw === "canceled" || raw === "incomplete") {
    return raw as SubscriptionStatus;
  }
  return "active";
}

function parseRoute(pathname: string, action: string): RouteAction | null {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith("/create")) return "create";
  if (normalized.endsWith("/generate-pack")) return "generate-pack";
  if (normalized.endsWith("/update-milestone")) return "update-milestone";
  if (normalized.endsWith("/tick-reminders")) return "tick-reminders";

  if (normalized.endsWith("/sba-prep")) {
    if (action === "create" || action === "generate-pack" || action === "update-milestone" || action === "tick-reminders") {
      return action;
    }
  }

  return null;
}

function clampTimelineMonths(value: number | null): number {
  if (!value || value < 1) return 9;
  return Math.max(6, Math.min(12, Math.trunc(value)));
}

function asMilestones(value: unknown): Milestone[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const key = normalizeString(item.key);
      if (!key) return null;
      const status = normalizeString(item.status).toLowerCase();
      const normalizedStatus = ["pending", "in_progress", "completed", "blocked"].includes(status)
        ? status as Milestone["status"]
        : "pending";

      return {
        key,
        title: normalizeString(item.title) || key,
        due_date: normalizeString(item.due_date) || new Date().toISOString().slice(0, 10),
        status: normalizedStatus,
        completed_at: normalizeString(item.completed_at) || undefined,
      } satisfies Milestone;
    })
    .filter((item): item is Milestone => Boolean(item));
}

function dueDateAfterDays(days: number): string {
  const at = new Date(Date.now() + Math.max(0, days) * 24 * 60 * 60 * 1000);
  return at.toISOString().slice(0, 10);
}

function dueDateAfterMonths(months: number): string {
  const at = new Date();
  at.setUTCMonth(at.getUTCMonth() + Math.max(0, months));
  return at.toISOString().slice(0, 10);
}

function buildDefaultMilestones(timelineMonths: number): Milestone[] {
  const months = clampTimelineMonths(timelineMonths);

  const base: Milestone[] = [
    {
      key: "foundation_readiness",
      title: "Foundation Readiness Review",
      due_date: dueDateAfterDays(14),
      status: "pending",
    },
    {
      key: "financial_cleanup",
      title: "Financial Cleanup and Consistency",
      due_date: dueDateAfterDays(45),
      status: "pending",
    },
    {
      key: "document_package",
      title: "Document Package Draft",
      due_date: dueDateAfterDays(75),
      status: "pending",
    },
    {
      key: "lender_readiness",
      title: "Lender Readiness Review",
      due_date: dueDateAfterDays(120),
      status: "pending",
    },
  ];

  for (let month = 1; month <= months; month += 1) {
    base.push({
      key: `month_${month}_checkin`,
      title: `Month ${month} Check-In`,
      due_date: dueDateAfterMonths(month),
      status: "pending",
    });
  }

  return base;
}

function formatMonthTag(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((i) => i.toString(16).padStart(2, "0")).join("");
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

async function isTenantManager(userClient: SupabaseClient, tenantId: string): Promise<boolean> {
  const rpc = await userClient.rpc("nexus_sba_can_manage_tenant", { p_tenant_id: tenantId });
  return !rpc.error && Boolean(rpc.data);
}

async function requirePremiumTier(params: {
  serviceClient: SupabaseClient;
  userId: string;
  tenantId: string;
}) {
  const subRes = await params.serviceClient
    .from("subscriptions")
    .select("tier,plan_code,status")
    .eq("user_id", params.userId)
    .eq("tenant_id", params.tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = (subRes.data || null) as SubscriptionRow | null;
  const tier = normalizeTier(row?.tier || row?.plan_code);
  const status = normalizeSubscriptionStatus(row?.status);

  if (tier !== "premium" || !["active", "trialing"].includes(status)) {
    throw new Error("Premium subscription with active status is required for SBA module outputs.");
  }
}

async function getPlanById(serviceClient: SupabaseClient, planId: string): Promise<PlanRow | null> {
  const res = await serviceClient
    .from("sba_prep_plans")
    .select("id,tenant_id,user_id,client_file_id,status,target_amount_cents,target_timeline_months,readiness_score,milestones,created_at,updated_at")
    .eq("id", planId)
    .limit(1)
    .maybeSingle();

  if (res.error || !res.data) return null;
  return res.data as PlanRow;
}

async function writeAuditEvent(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  actorUserId: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
}) {
  const firstTry = await params.serviceClient.from("audit_events").insert({
    tenant_id: params.tenantId,
    actor_user_id: params.actorUserId,
    event_type: params.eventType,
    metadata: params.metadata,
  });

  if (!firstTry.error) return;

  await params.serviceClient.from("audit_events").insert({
    tenant_id: params.tenantId,
    actor_user_id: params.actorUserId,
    actor_type: "system",
    action: params.eventType,
    entity_type: "sba_prep",
    entity_id: String(params.metadata.entity_id || "sba"),
    metadata: params.metadata,
  });
}

async function getUserEmail(serviceClient: SupabaseClient, userId: string): Promise<string | null> {
  const res = await serviceClient.auth.admin.getUserById(userId);
  if (res.error || !res.data.user?.email) return null;
  return normalizeString(res.data.user.email).toLowerCase() || null;
}

async function sendEmailViaOrchestrator(params: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  authHeader: string;
  to: string;
  userId: string;
  subject: string;
  html: string;
  text: string;
  messageType: "transactional" | "reminders";
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
      message_type: params.messageType,
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

async function createInitialTasks(serviceClient: SupabaseClient, plan: PlanRow) {
  const payload = [
    {
      tenant_id: plan.tenant_id,
      user_id: plan.user_id,
      task_id: `sba:${plan.id}:review_requirements`,
      title: "SBA.REVIEW_REQUIREMENTS",
      description: "Review educational SBA checklist requirements and upload expectations.",
      status: "pending",
      due_date: dueDateAfterDays(3),
      type: "education",
      signal: "yellow",
      assigned_employee: "SBA Prep",
      group_key: "sba",
      template_key: "SBA.REVIEW_REQUIREMENTS",
      meta: {
        source: "sba_prep",
        plan_id: plan.id,
        reminder_kind: "requirements",
      },
    },
    {
      tenant_id: plan.tenant_id,
      user_id: plan.user_id,
      task_id: `sba:${plan.id}:upload_docs`,
      title: "SBA.UPLOAD_DOCS",
      description: "Upload and organize required SBA-prep documents in the educational vault map.",
      status: "pending",
      due_date: dueDateAfterDays(14),
      type: "upload",
      signal: "yellow",
      assigned_employee: "SBA Prep",
      group_key: "sba",
      template_key: "SBA.UPLOAD_DOCS",
      meta: {
        source: "sba_prep",
        plan_id: plan.id,
        reminder_kind: "documents",
      },
    },
    {
      tenant_id: plan.tenant_id,
      user_id: plan.user_id,
      task_id: `sba:${plan.id}:monthly_checkin:${formatMonthTag(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))}`,
      title: "SBA.MONTHLY_CHECKIN",
      description: "Monthly educational SBA check-in: update readiness and complete milestone progress.",
      status: "pending",
      due_date: dueDateAfterDays(30),
      type: "review",
      signal: "yellow",
      assigned_employee: "SBA Prep",
      group_key: "sba",
      template_key: "SBA.MONTHLY_CHECKIN",
      meta: {
        source: "sba_prep",
        plan_id: plan.id,
        reminder_kind: "monthly",
      },
    },
  ];

  await serviceClient.from("client_tasks").upsert(payload, { onConflict: "tenant_id,task_id" });
}

async function ensureMonthlyReminderTask(params: {
  serviceClient: SupabaseClient;
  plan: PlanRow;
}) {
  const monthTag = formatMonthTag();
  const taskId = `sba:${params.plan.id}:monthly_checkin:${monthTag}`;

  const existing = await params.serviceClient
    .from("client_tasks")
    .select("task_id")
    .eq("tenant_id", params.plan.tenant_id)
    .eq("task_id", taskId)
    .limit(1)
    .maybeSingle();

  if (!existing.error && existing.data) {
    return false;
  }

  const insertRes = await params.serviceClient
    .from("client_tasks")
    .insert({
      tenant_id: params.plan.tenant_id,
      user_id: params.plan.user_id,
      task_id: taskId,
      title: "SBA.MONTHLY_CHECKIN",
      description: "Monthly educational SBA check-in reminder. Update checklist progress and readiness.",
      status: "pending",
      due_date: new Date().toISOString().slice(0, 10),
      type: "review",
      signal: "yellow",
      assigned_employee: "SBA Prep",
      group_key: "sba",
      template_key: "SBA.MONTHLY_CHECKIN",
      meta: {
        source: "sba_prep",
        plan_id: params.plan.id,
        month_tag: monthTag,
      },
    });

  return !insertRes.error;
}

function buildPackMarkdown(input: {
  plan: PlanRow;
  requiredDocs: RequiredDocRow[];
  links: Array<{ required_doc_key: string; status: string }>;
}): string {
  const milestones = asMilestones(input.plan.milestones);
  const linkByKey = new Map<string, string>(input.links.map((row) => [row.required_doc_key, row.status]));

  const timelineMonths = input.plan.target_timeline_months || 9;
  const amountLabel = input.plan.target_amount_cents && input.plan.target_amount_cents > 0
    ? `$${(input.plan.target_amount_cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : "Not set";

  const docSection = input.requiredDocs
    .map((doc, idx) => {
      const status = normalizeString(linkByKey.get(doc.key) || "missing").toLowerCase();
      const statusLabel = status === "verified" ? "Verified" : (status === "uploaded" ? "Uploaded" : "Missing");
      return `${idx + 1}. **${doc.title}** (${doc.key}) - ${statusLabel}\n   - ${doc.description_md}`;
    })
    .join("\n");

  const milestoneSection = milestones
    .map((m, idx) => `${idx + 1}. **${m.title}** (${m.key}) - Due: ${m.due_date} - Status: ${m.status}`)
    .join("\n");

  return [
    "# SBA Prep Checklist Pack",
    "",
    "## Educational Notice",
    "This module provides educational templates, checklists, and readiness guidance only.",
    "No promise of SBA approval, timing, or funding amount is made.",
    "",
    "## Plan Snapshot",
    `- Plan ID: ${input.plan.id}`,
    `- Target Amount: ${amountLabel}`,
    `- Target Timeline: ${timelineMonths} month(s)`,
    `- Current Readiness Score: ${input.plan.readiness_score}/100`,
    "",
    "## Required Documents",
    docSection || "No required documents configured.",
    "",
    "## Milestones",
    milestoneSection || "No milestones set.",
    "",
    "## Readiness Guidance (Educational)",
    "- Keep financial statements current and internally consistent.",
    "- Maintain complete source documents for all reported figures.",
    "- Track monthly improvements and review lender feedback themes.",
    "- Confirm final package details with your lender and licensed advisors.",
    "",
    "## Disclaimers",
    "- Educational only; not legal, tax, accounting, or investment advice.",
    "- Consult your SBA lender, CPA, and attorney before final submission decisions.",
    "- Results vary. No guarantees of approval, terms, or funding outcomes.",
  ].join("\n");
}

async function handleCreate(params: {
  serviceClient: SupabaseClient;
  userClient: SupabaseClient;
  userId: string;
  body: CreateBody;
  supabaseUrl: string;
  supabaseAnonKey: string;
  authHeader: string;
}): Promise<Response> {
  const clientFileId = normalizeString(params.body.client_file_id);
  if (!clientFileId) return json(400, { error: "client_file_id is required." });

  const targetAmount = toInteger(params.body.target_amount_cents);
  const targetTimeline = clampTimelineMonths(toInteger(params.body.target_timeline_months));

  const tenantId = await resolveTenantIdForUser(params.serviceClient, params.userId);
  if (!tenantId) return json(400, { error: "Unable to resolve tenant context." });

  await requirePremiumTier({
    serviceClient: params.serviceClient,
    userId: params.userId,
    tenantId,
  });

  const milestones = buildDefaultMilestones(targetTimeline);

  const planRes = await params.serviceClient
    .from("sba_prep_plans")
    .insert({
      tenant_id: tenantId,
      user_id: params.userId,
      client_file_id: clientFileId,
      status: "in_progress",
      target_amount_cents: targetAmount,
      target_timeline_months: targetTimeline,
      readiness_score: 0,
      milestones,
    })
    .select("id,tenant_id,user_id,client_file_id,status,target_amount_cents,target_timeline_months,readiness_score,milestones,created_at,updated_at")
    .single();

  if (planRes.error || !planRes.data) {
    return json(400, { error: planRes.error?.message || "Unable to create SBA prep plan." });
  }

  const plan = planRes.data as PlanRow;

  const requiredDocsRes = await params.serviceClient
    .from("sba_documents_required")
    .select("key,title,description_md")
    .order("key", { ascending: true });

  if (requiredDocsRes.error) {
    return json(400, { error: requiredDocsRes.error.message || "Unable to load SBA required documents." });
  }

  const requiredDocs = (requiredDocsRes.data || []) as RequiredDocRow[];

  if (requiredDocs.length > 0) {
    const linksPayload = requiredDocs.map((doc) => ({
      plan_id: plan.id,
      required_doc_key: doc.key,
      status: "missing",
      upload_id: null,
      verified_by: null,
    }));

    const linksRes = await params.serviceClient.from("sba_document_links").insert(linksPayload);
    if (linksRes.error) {
      return json(400, { error: linksRes.error.message || "Unable to seed SBA document links." });
    }
  }

  const docRes = await params.serviceClient
    .from("documents")
    .upsert({
      tenant_id: plan.tenant_id,
      user_id: plan.user_id,
      category: "sba",
      title: "SBA Prep Checklist Pack",
      status: "needs_review",
      source_type: "manual",
      source_id: plan.id,
      storage_path: null,
      content_hash: null,
    }, { onConflict: "source_type,source_id" })
    .select("id")
    .single();

  if (docRes.error || !docRes.data?.id) {
    return json(400, { error: docRes.error?.message || "Unable to index SBA checklist document." });
  }

  await createInitialTasks(params.serviceClient, plan);
  await params.serviceClient.rpc("nexus_sba_recompute_plan_readiness", { p_plan_id: plan.id });

  await writeAuditEvent({
    serviceClient: params.serviceClient,
    tenantId: plan.tenant_id,
    actorUserId: params.userId,
    eventType: "sba.plan.created",
    metadata: {
      entity_id: plan.id,
      client_file_id: plan.client_file_id,
      target_amount_cents: plan.target_amount_cents,
      target_timeline_months: plan.target_timeline_months,
      required_doc_count: requiredDocs.length,
      document_id: String(docRes.data.id),
    },
  });

  const userEmail = await getUserEmail(params.serviceClient, params.userId);
  if (userEmail) {
    await sendEmailViaOrchestrator({
      supabaseUrl: params.supabaseUrl,
      supabaseAnonKey: params.supabaseAnonKey,
      authHeader: params.authHeader,
      to: userEmail,
      userId: params.userId,
      subject: "SBA Prep Plan Created",
      html: "<p>Your SBA prep educational plan is ready.</p><p>Review checklist tasks and upload required documents in your portal.</p><p>Educational only. No guarantees.</p>",
      text: "Your SBA prep educational plan is ready. Review checklist tasks and upload required documents. Educational only. No guarantees.",
      messageType: "transactional",
      templateKey: "sba_plan_created",
      data: {
        plan_id: plan.id,
      },
    });
  }

  return json(200, {
    success: true,
    plan_id: plan.id,
    document_id: String(docRes.data.id),
  });
}

async function handleGeneratePack(params: {
  serviceClient: SupabaseClient;
  userClient: SupabaseClient;
  userId: string;
  body: GeneratePackBody;
}): Promise<Response> {
  const planId = normalizeString(params.body.plan_id);
  if (!planId) return json(400, { error: "plan_id is required." });

  const plan = await getPlanById(params.serviceClient, planId);
  if (!plan) return json(404, { error: "SBA prep plan not found." });

  const canManage = await isTenantManager(params.userClient, plan.tenant_id);
  if (plan.user_id !== params.userId && !canManage) {
    return json(403, { error: "Unauthorized plan access." });
  }

  await requirePremiumTier({
    serviceClient: params.serviceClient,
    userId: plan.user_id,
    tenantId: plan.tenant_id,
  });

  const requiredRes = await params.serviceClient
    .from("sba_documents_required")
    .select("key,title,description_md")
    .order("key", { ascending: true });

  if (requiredRes.error) {
    return json(400, { error: requiredRes.error.message || "Unable to load required document definitions." });
  }

  const linksRes = await params.serviceClient
    .from("sba_document_links")
    .select("required_doc_key,status,upload_id")
    .eq("plan_id", plan.id)
    .order("required_doc_key", { ascending: true });

  if (linksRes.error) {
    return json(400, { error: linksRes.error.message || "Unable to load plan document links." });
  }

  const markdown = buildPackMarkdown({
    plan,
    requiredDocs: (requiredRes.data || []) as RequiredDocRow[],
    links: ((linksRes.data || []) as Array<{ required_doc_key: string; status: string }>),
  });

  const hash = await sha256Hex(markdown);

  let storagePath: string | null = null;
  const objectPath = `sba/packs/${plan.tenant_id}/${plan.user_id}/${plan.id}/${Date.now()}.md`;

  const uploadRes = await params.serviceClient.storage
    .from("documents")
    .upload(objectPath, markdown, {
      contentType: "text/markdown; charset=utf-8",
      upsert: true,
    });

  if (!uploadRes.error) {
    storagePath = `documents/${objectPath}`;
  }

  const docRes = await params.serviceClient
    .from("documents")
    .upsert({
      tenant_id: plan.tenant_id,
      user_id: plan.user_id,
      category: "sba",
      title: "SBA Prep Checklist Pack",
      status: "needs_review",
      source_type: "manual",
      source_id: plan.id,
      storage_path: storagePath,
      content_hash: hash,
    }, { onConflict: "source_type,source_id" })
    .select("id")
    .single();

  if (docRes.error || !docRes.data?.id) {
    return json(400, { error: docRes.error?.message || "Unable to save SBA checklist pack document." });
  }

  await params.serviceClient
    .from("client_tasks")
    .upsert({
      tenant_id: plan.tenant_id,
      user_id: plan.user_id,
      task_id: `sba:${plan.id}:review_generated_pack`,
      title: "SBA.REVIEW_PACK",
      description: "Review generated educational SBA checklist pack and confirm next milestone actions.",
      status: "pending",
      due_date: dueDateAfterDays(2),
      type: "review",
      signal: "yellow",
      assigned_employee: "SBA Prep",
      group_key: "sba",
      template_key: "SBA.REVIEW_PACK",
      meta: {
        source: "sba_prep",
        plan_id: plan.id,
        document_id: String(docRes.data.id),
      },
    }, { onConflict: "tenant_id,task_id" });

  await writeAuditEvent({
    serviceClient: params.serviceClient,
    tenantId: plan.tenant_id,
    actorUserId: params.userId,
    eventType: "sba.pack.generated",
    metadata: {
      entity_id: String(docRes.data.id),
      plan_id: plan.id,
      content_hash: hash,
      storage_path: storagePath,
    },
  });

  return json(200, {
    success: true,
    document_id: String(docRes.data.id),
    storage_path: storagePath,
    content_hash: hash,
  });
}

async function handleUpdateMilestone(params: {
  serviceClient: SupabaseClient;
  userClient: SupabaseClient;
  userId: string;
  body: UpdateMilestoneBody;
}): Promise<Response> {
  const planId = normalizeString(params.body.plan_id);
  const milestoneKey = normalizeString(params.body.milestone_key);
  const status = normalizeString(params.body.status).toLowerCase();

  if (!planId) return json(400, { error: "plan_id is required." });
  if (!milestoneKey) return json(400, { error: "milestone_key is required." });
  if (!["pending", "in_progress", "completed", "blocked"].includes(status)) {
    return json(400, { error: "status must be one of: pending, in_progress, completed, blocked." });
  }

  const plan = await getPlanById(params.serviceClient, planId);
  if (!plan) return json(404, { error: "SBA prep plan not found." });

  const canManage = await isTenantManager(params.userClient, plan.tenant_id);
  if (plan.user_id !== params.userId && !canManage) {
    return json(403, { error: "Unauthorized plan access." });
  }

  const milestones = asMilestones(plan.milestones);
  const index = milestones.findIndex((item) => item.key === milestoneKey);
  if (index < 0) return json(400, { error: "milestone_key not found in plan milestones." });

  const nextMilestones = milestones.map((item, idx) => {
    if (idx !== index) return item;
    return {
      ...item,
      status: status as Milestone["status"],
      completed_at: status === "completed" ? new Date().toISOString() : undefined,
    } satisfies Milestone;
  });

  const updateRes = await params.serviceClient
    .from("sba_prep_plans")
    .update({ milestones: nextMilestones })
    .eq("id", plan.id)
    .select("id,tenant_id,user_id,client_file_id,status,target_amount_cents,target_timeline_months,readiness_score,milestones,created_at,updated_at")
    .single();

  if (updateRes.error || !updateRes.data) {
    return json(400, { error: updateRes.error?.message || "Unable to update milestone." });
  }

  await params.serviceClient.rpc("nexus_sba_recompute_plan_readiness", { p_plan_id: plan.id });

  const refreshed = await getPlanById(params.serviceClient, plan.id);

  await writeAuditEvent({
    serviceClient: params.serviceClient,
    tenantId: plan.tenant_id,
    actorUserId: params.userId,
    eventType: "sba.milestone.updated",
    metadata: {
      entity_id: plan.id,
      milestone_key: milestoneKey,
      milestone_status: status,
      readiness_score: refreshed?.readiness_score ?? null,
      plan_status: refreshed?.status ?? null,
    },
  });

  return json(200, {
    success: true,
    plan_id: plan.id,
    readiness_score: refreshed?.readiness_score ?? (updateRes.data as PlanRow).readiness_score,
    plan_status: refreshed?.status ?? (updateRes.data as PlanRow).status,
    milestones: refreshed ? asMilestones(refreshed.milestones) : nextMilestones,
  });
}

async function handleTickReminders(params: {
  serviceClient: SupabaseClient;
  userClient: SupabaseClient;
  userId: string;
  body: TickRemindersBody;
  supabaseUrl: string;
  supabaseAnonKey: string;
  authHeader: string;
}): Promise<Response> {
  const singlePlanId = normalizeString(params.body.plan_id);

  const plans: PlanRow[] = [];

  if (singlePlanId) {
    const plan = await getPlanById(params.serviceClient, singlePlanId);
    if (!plan) return json(404, { error: "SBA prep plan not found." });

    const canManage = await isTenantManager(params.userClient, plan.tenant_id);
    if (!canManage) {
      return json(403, { error: "Only tenant admins can run monthly reminder tick." });
    }

    plans.push(plan);
  } else {
    const tenantId = await resolveTenantIdForUser(params.serviceClient, params.userId);
    if (!tenantId) return json(400, { error: "Unable to resolve tenant context." });

    const canManage = await isTenantManager(params.userClient, tenantId);
    if (!canManage) {
      return json(403, { error: "Only tenant admins can run monthly reminder tick." });
    }

    const planRes = await params.serviceClient
      .from("sba_prep_plans")
      .select("id,tenant_id,user_id,client_file_id,status,target_amount_cents,target_timeline_months,readiness_score,milestones,created_at,updated_at")
      .eq("tenant_id", tenantId)
      .in("status", ["in_progress", "ready_to_apply"])
      .order("updated_at", { ascending: true })
      .limit(200);

    if (planRes.error) {
      return json(400, { error: planRes.error.message || "Unable to load SBA plans for reminder tick." });
    }

    plans.push(...((planRes.data || []) as PlanRow[]));
  }

  let createdTasks = 0;
  let emailed = 0;

  for (const plan of plans) {
    const created = await ensureMonthlyReminderTask({
      serviceClient: params.serviceClient,
      plan,
    });

    if (!created) continue;
    createdTasks += 1;

    const toEmail = await getUserEmail(params.serviceClient, plan.user_id);
    if (!toEmail) continue;

    await sendEmailViaOrchestrator({
      supabaseUrl: params.supabaseUrl,
      supabaseAnonKey: params.supabaseAnonKey,
      authHeader: params.authHeader,
      to: toEmail,
      userId: plan.user_id,
      subject: "SBA Monthly Check-In Reminder",
      html: "<p>Your SBA prep monthly check-in is ready.</p><p>Please review milestones and upload updates in your educational prep plan.</p><p>Educational only. No guarantees.</p>",
      text: "Your SBA prep monthly check-in is ready. Review milestones and upload updates. Educational only. No guarantees.",
      messageType: "reminders",
      templateKey: "sba_monthly_checkin",
      data: {
        plan_id: plan.id,
        month_tag: formatMonthTag(),
      },
    });

    emailed += 1;

    await writeAuditEvent({
      serviceClient: params.serviceClient,
      tenantId: plan.tenant_id,
      actorUserId: params.userId,
      eventType: "sba.monthly_reminder.queued",
      metadata: {
        entity_id: plan.id,
        month_tag: formatMonthTag(),
      },
    });
  }

  return json(200, {
    success: true,
    plans_scanned: plans.length,
    tasks_created: createdTasks,
    emails_queued: emailed,
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

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
  const userId = authRes.data.user?.id || null;
  if (authRes.error || !userId) {
    return json(401, { error: "Unauthorized." });
  }

  let body: Record<string, unknown> = {};
  try {
    body = parseObject(await req.json());
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const action = normalizeString(body.action).toLowerCase();
  const route = parseRoute(new URL(req.url).pathname, action);
  if (!route) {
    return json(404, { error: "Route not found." });
  }

  try {
    if (route === "create") {
      return await handleCreate({
        serviceClient,
        userClient,
        userId,
        body: body as CreateBody,
        supabaseUrl,
        supabaseAnonKey,
        authHeader,
      });
    }

    if (route === "generate-pack") {
      return await handleGeneratePack({
        serviceClient,
        userClient,
        userId,
        body: body as GeneratePackBody,
      });
    }

    if (route === "update-milestone") {
      return await handleUpdateMilestone({
        serviceClient,
        userClient,
        userId,
        body: body as UpdateMilestoneBody,
      });
    }

    if (route === "tick-reminders") {
      return await handleTickReminders({
        serviceClient,
        userClient,
        userId,
        body: body as TickRemindersBody,
        supabaseUrl,
        supabaseAnonKey,
        authHeader,
      });
    }

    return json(404, { error: "Route not found." });
  } catch (error) {
    return json(400, {
      error: normalizeString((error as Error)?.message || error),
    });
  }
});
