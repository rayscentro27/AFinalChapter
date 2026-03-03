import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { piiScanPayload } from "../_shared/piiScanner.ts";

type RouteAction = "shortlist" | "draft" | "mark-approved" | "mark-submitted";

type ShortlistBody = {
  client_file_id?: unknown;
  filters?: {
    geography?: unknown;
    tags?: unknown;
  };
  action?: unknown;
};

type DraftBody = {
  grant_match_id?: unknown;
  action?: unknown;
};

type MarkApprovedBody = {
  document_id?: unknown;
  action?: unknown;
};

type MarkSubmittedBody = {
  grant_match_id?: unknown;
  submission_method?: unknown;
  confirmation_ref?: unknown;
  action?: unknown;
};

type GrantCatalogRow = {
  id: string;
  source: string;
  name: string;
  sponsor: string;
  url: string | null;
  geography: string[] | null;
  industry_tags: string[] | null;
  eligibility_md: string;
  award_range_md: string | null;
  deadline_date: string | null;
};

type GrantMatchRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  client_file_id: string;
  grant_id: string;
  status: string;
};

type DraftRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  client_file_id: string;
  grant_match_id: string;
  status: string;
  draft_md: string;
};

type PolicyVersionRow = {
  id: string;
};

type FundingSubscriptionRow = {
  plan_code?: string | null;
  tier?: string | null;
  status?: string | null;
};

type ConsentStatusRow = {
  disclaimers_accepted?: boolean;
  ai_disclosure_accepted?: boolean;
};

type MatchRanking = {
  grant: GrantCatalogRow;
  match_score: number;
  reasons: Array<{ code: string; detail: string }>;
};

type SanitizedSnapshot = {
  client_file_id: string;
  region: string;
  business_stage: string;
  industry_tags: string[];
  years_in_business: number;
  annual_revenue_band: string;
  employee_count_band: string;
  readiness: {
    docs_ready: boolean;
    credit_score_est: number;
    utilization_pct: number;
    has_major_derog: boolean;
  };
  educational_only: true;
  no_guarantee: true;
  generated_at: string;
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

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item).toLowerCase())
    .filter(Boolean);
}

function normalizeTier(value: unknown): "free" | "growth" | "premium" {
  const raw = normalizeString(value).toLowerCase();
  if (raw === "premium") return "premium";
  if (raw === "growth") return "growth";
  return "free";
}

function normalizeSubscriptionStatus(value: unknown): string {
  const raw = normalizeString(value).toLowerCase();
  return raw || "active";
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseRoute(pathname: string, action: string): RouteAction | null {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith("/shortlist")) return "shortlist";
  if (normalized.endsWith("/draft")) return "draft";
  if (normalized.endsWith("/mark-approved")) return "mark-approved";
  if (normalized.endsWith("/mark-submitted")) return "mark-submitted";
  if (normalized.endsWith("/grants-engine")) {
    if (action === "shortlist" || action === "draft" || action === "mark-approved" || action === "mark-submitted") {
      return action;
    }
  }
  return null;
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
  const rpcRes = await userClient.rpc("nexus_grants_can_manage_tenant", {
    p_tenant_id: tenantId,
  });

  return !rpcRes.error && Boolean(rpcRes.data);
}

async function requirePremiumTier(params: {
  serviceClient: SupabaseClient;
  userId: string;
  tenantId: string;
}) {
  const subRes = await params.serviceClient
    .from("subscriptions")
    .select("plan_code,tier,status")
    .eq("user_id", params.userId)
    .eq("tenant_id", params.tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = (subRes.data || null) as FundingSubscriptionRow | null;
  const tier = normalizeTier(row?.tier || row?.plan_code);
  const status = normalizeSubscriptionStatus(row?.status);

  if (tier !== "premium" || !["active", "trialing"].includes(status)) {
    throw new Error("Premium subscription with active status is required for Grants Engine actions.");
  }
}

async function requireDraftConsents(serviceClient: SupabaseClient, userId: string) {
  const statusRes = await serviceClient
    .from("user_consent_status")
    .select("ai_disclosure_accepted,disclaimers_accepted")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const row = (statusRes.data || null) as ConsentStatusRow | null;
  if (!row?.ai_disclosure_accepted || !row?.disclaimers_accepted) {
    throw new Error("AI disclosure and disclaimers consent are required before generating grant drafts.");
  }
}

function removePotentialPii(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => removePotentialPii(item));
  }

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(input)) {
      const lower = key.toLowerCase();
      const piiKey = [
        "name",
        "email",
        "phone",
        "address",
        "ssn",
        "dob",
        "birth",
        "tax",
        "ein",
        "account",
        "routing",
      ].some((needle) => lower.includes(needle));

      if (piiKey) continue;
      output[key] = removePotentialPii(val);
    }

    return output;
  }

  if (typeof value === "string") {
    return value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
      .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, "[REDACTED_SSN]")
      .replace(/\b\d{10,16}\b/g, "[REDACTED_NUMBER]");
  }

  return value;
}

async function loadClientSnapshot(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  userId: string;
  clientFileId: string;
}): Promise<SanitizedSnapshot> {
  const clientFileRes = await params.serviceClient
    .from("client_files")
    .select("id,user_id,status_json,region,state,industry_tags")
    .eq("id", params.clientFileId)
    .eq("user_id", params.userId)
    .limit(1)
    .maybeSingle();

  let fileObj: Record<string, unknown> = {};
  let region = "US";
  let fileIndustryTags: string[] = [];

  if (!clientFileRes.error && clientFileRes.data) {
    const row = clientFileRes.data as Record<string, unknown>;
    fileObj = asObject(row.status_json);
    region = normalizeString(row.region || row.state || fileObj.region || fileObj.state).toUpperCase() || "US";
    fileIndustryTags = asArrayOfStrings(row.industry_tags || fileObj.industry_tags);
  }

  const profileRes = await params.serviceClient
    .from("tenant_profiles")
    .select("credit_score_est,has_major_derog,utilization_pct,docs_ready")
    .eq("tenant_id", params.tenantId)
    .limit(1)
    .maybeSingle();

  const profile = asObject(profileRes.data);

  const rawSnapshot: SanitizedSnapshot = {
    client_file_id: params.clientFileId,
    region,
    business_stage: normalizeString(fileObj.business_stage || fileObj.stage || "operating") || "operating",
    industry_tags: fileIndustryTags,
    years_in_business: clamp(toNumber(fileObj.years_in_business || fileObj.time_in_business_years || 1), 0, 99),
    annual_revenue_band: normalizeString(fileObj.annual_revenue_band || "unknown") || "unknown",
    employee_count_band: normalizeString(fileObj.employee_count_band || "unknown") || "unknown",
    readiness: {
      docs_ready: Boolean(fileObj.docs_ready ?? profile.docs_ready ?? true),
      credit_score_est: clamp(toNumber(fileObj.credit_score_est ?? profile.credit_score_est ?? 650), 300, 900),
      utilization_pct: clamp(toNumber(fileObj.utilization_pct ?? profile.utilization_pct ?? 40), 0, 100),
      has_major_derog: Boolean(fileObj.has_major_derog ?? profile.has_major_derog ?? false),
    },
    educational_only: true,
    no_guarantee: true,
    generated_at: new Date().toISOString(),
  };

  const sanitized = removePotentialPii(rawSnapshot) as SanitizedSnapshot;
  const scan = piiScanPayload(sanitized);
  if (scan.blocked) {
    throw new Error("Sanitized client profile snapshot contains PII patterns and cannot be used for grants processing.");
  }

  return sanitized;
}

function hasOverlap(base: string[] | null | undefined, filterValues: string[]): boolean {
  if (!Array.isArray(base) || base.length === 0) return filterValues.length === 0;
  if (filterValues.length === 0) return true;
  const normalized = base.map((item) => normalizeString(item).toLowerCase());
  return filterValues.some((item) => normalized.includes(item));
}

function rankGrant(grant: GrantCatalogRow, snapshot: SanitizedSnapshot, filters: { geography: string[]; tags: string[] }): MatchRanking {
  let score = 35;
  const reasons: Array<{ code: string; detail: string }> = [];

  const geo = (grant.geography || []).map((g) => normalizeString(g).toLowerCase()).filter(Boolean);
  if (geo.includes("us") || geo.includes(snapshot.region.toLowerCase())) {
    score += 20;
    reasons.push({ code: "geography_match", detail: "Grant geography includes client region." });
  } else {
    score -= 15;
    reasons.push({ code: "geography_gap", detail: "Grant geography appears limited for current region." });
  }

  const tagMatches = (grant.industry_tags || [])
    .map((t) => normalizeString(t).toLowerCase())
    .filter((t) => snapshot.industry_tags.includes(t) || filters.tags.includes(t));

  if (tagMatches.length > 0) {
    score += Math.min(25, tagMatches.length * 8);
    reasons.push({ code: "industry_match", detail: `Matched tags: ${tagMatches.slice(0, 4).join(", ")}` });
  } else {
    reasons.push({ code: "industry_generic", detail: "No direct industry tag overlap detected." });
  }

  if (snapshot.readiness.docs_ready) {
    score += 8;
    reasons.push({ code: "docs_ready", detail: "Readiness profile indicates supporting documents are available." });
  }

  if (snapshot.readiness.credit_score_est >= 680 && !snapshot.readiness.has_major_derog) {
    score += 6;
    reasons.push({ code: "readiness_positive", detail: "Profile readiness indicators are favorable." });
  }

  if (grant.deadline_date) {
    const now = new Date();
    const deadline = new Date(grant.deadline_date);
    const days = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) {
      score = -100;
      reasons.push({ code: "deadline_passed", detail: "Deadline appears passed." });
    } else if (days <= 14) {
      score += 5;
      reasons.push({ code: "deadline_soon", detail: `Deadline in ${days} day(s). Prioritize review.` });
    }
  }

  score = clamp(score, 0, 100);

  return {
    grant,
    match_score: score,
    reasons,
  };
}

async function createShortlistTasks(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  userId: string;
  clientFileId: string;
  shortlisted: MatchRanking[];
}) {
  const tasks: Array<Record<string, unknown>> = [
    {
      tenant_id: params.tenantId,
      user_id: params.userId,
      task_id: `grants:${params.clientFileId}:review_shortlist`,
      title: "GRANTS.REVIEW_SHORTLIST",
      description: "Review your educational grant shortlist. No grant outcomes are guaranteed.",
      status: "pending",
      due_date: new Date().toISOString().slice(0, 10),
      type: "review",
      meta: {
        source: "grants_engine",
        client_file_id: params.clientFileId,
        task_key: "GRANTS.REVIEW_SHORTLIST",
      },
    },
    {
      tenant_id: params.tenantId,
      user_id: params.userId,
      task_id: `grants:${params.clientFileId}:select_target_grants`,
      title: "GRANTS.SELECT_TARGET_GRANTS",
      description: "Select target grants and create drafts for client-approved submissions.",
      status: "pending",
      due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      type: "action",
      meta: {
        source: "grants_engine",
        client_file_id: params.clientFileId,
        task_key: "GRANTS.SELECT_TARGET_GRANTS",
      },
    },
  ];

  params.shortlisted.forEach((item) => {
    if (!item.grant.deadline_date) return;
    const deadline = new Date(item.grant.deadline_date);
    const days = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0 || days > 14) return;

    tasks.push({
      tenant_id: params.tenantId,
      user_id: params.userId,
      task_id: `grants:${params.clientFileId}:deadline:${item.grant.id}`,
      title: "GRANTS.DEADLINE_REMINDER",
      description: `Deadline reminder for ${item.grant.name}. Verify sponsor timeline and client submission readiness.`,
      status: "pending",
      due_date: new Date(Math.max(Date.now(), deadline.getTime() - 3 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10),
      type: "review",
      meta: {
        source: "grants_engine",
        client_file_id: params.clientFileId,
        task_key: "GRANTS.DEADLINE_REMINDER",
        grant_id: item.grant.id,
        deadline_date: item.grant.deadline_date,
      },
    });
  });

  await params.serviceClient
    .from("client_tasks")
    .upsert(tasks, { onConflict: "tenant_id,task_id" });
}

async function writeAuditEvent(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  actorUserId: string;
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
    entity_type: "grants",
    entity_id: String(params.metadata.entity_id || "grants"),
    metadata: params.metadata,
  });
}

function fallbackDraft(grant: GrantCatalogRow, snapshot: SanitizedSnapshot): string {
  return [
    `# Grant Draft Template: ${grant.name}`,
    "",
    "## Educational Notice",
    "This draft is an educational template. The client reviews, edits, and submits. No grant outcomes are guaranteed.",
    "",
    "## Applicant Summary",
    `- Region: ${snapshot.region}`,
    `- Business Stage: ${snapshot.business_stage}`,
    `- Years in Business: ${snapshot.years_in_business}`,
    `- Industry Tags: ${snapshot.industry_tags.join(", ") || "Not specified"}`,
    "",
    "## Sponsor Fit Statement",
    `This draft aligns to ${grant.sponsor} program goals based on published eligibility guidance and the sanitized readiness profile.`,
    "",
    "## Proposed Use of Funds",
    "1. Stabilize and scale operations in alignment with sponsor goals.",
    "2. Execute measurable milestones tied to community/economic outcomes.",
    "3. Track outcomes and report progress to sponsor requirements.",
    "",
    "## Eligibility Alignment Checklist",
    "- Review sponsor criteria line-by-line with client records.",
    "- Confirm required attachments before submission.",
    "- Confirm final narrative and budget are client-approved.",
    "",
    "## Client Approval Requirement",
    "Client confirms final accuracy before any submission action.",
  ].join("\n");
}

async function tryGenerateViaAiTaskRunner(params: {
  supabaseUrl: string;
  anonKey: string;
  authHeader: string;
  grant: GrantCatalogRow;
  snapshot: SanitizedSnapshot;
}): Promise<{ draft_md: string; provider: string; mode: string; raw?: unknown }> {
  const payload = {
    agent_key: "grants",
    prompt: [
      "Generate an educational grant application draft.",
      "Do not include PII and do not claim guaranteed outcomes.",
      "State clearly that client reviews and submits.",
    ].join(" "),
    input: {
      grant: {
        name: params.grant.name,
        sponsor: params.grant.sponsor,
        eligibility_md: params.grant.eligibility_md,
        award_range_md: params.grant.award_range_md,
        deadline_date: params.grant.deadline_date,
      },
      snapshot: params.snapshot,
    },
  };

  const scan = piiScanPayload(payload);
  if (scan.blocked) {
    throw new Error("AI payload blocked by PII scanner.");
  }

  const endpoint = `${params.supabaseUrl.replace(/\/+$/, "")}/functions/v1/ai-task-runner/run`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": params.authHeader,
      "apikey": params.anonKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`ai-task-runner unavailable (${response.status})`);
  }

  const data = await response.json().catch(() => ({}));
  const obj = asObject(data);
  const draft = normalizeString(obj.draft_md || obj.output || obj.content || obj.text);
  if (!draft) {
    throw new Error("ai-task-runner response missing draft text");
  }

  return {
    draft_md: draft,
    provider: "ai-task-runner",
    mode: "live",
    raw: data,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((i) => i.toString(16).padStart(2, "0")).join("");
}

async function resolveLatestPolicyVersionId(serviceClient: SupabaseClient): Promise<string | null> {
  const fnRes = await serviceClient.rpc("nexus_grants_latest_policy_version_id", {
    p_key: "grants_disclaimer",
  });

  if (!fnRes.error && fnRes.data) {
    return String(fnRes.data);
  }

  const fallback = await serviceClient
    .from("policy_documents")
    .select("id")
    .eq("key", "grants_disclaimer")
    .limit(1)
    .maybeSingle();

  if (fallback.error || !fallback.data?.id) return null;

  const version = await serviceClient
    .from("policy_versions")
    .select("id")
    .eq("document_id", String(fallback.data.id))
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (version.error || !version.data?.id) return null;
  return String(version.data.id);
}

async function sendDraftReadyEmail(params: {
  serviceClient: SupabaseClient;
  supabaseUrl: string;
  anonKey: string;
  authHeader: string;
  userId: string;
  draftId: string;
  grantName: string;
}) {
  const userRes = await params.serviceClient.auth.admin.getUserById(params.userId);
  const toEmail = normalizeString(userRes.data.user?.email).toLowerCase();
  if (!toEmail) return;

  await fetch(`${params.supabaseUrl.replace(/\/+$/, "")}/functions/v1/email-orchestrator/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": params.authHeader,
      "apikey": params.anonKey,
    },
    body: JSON.stringify({
      message_type: "transactional",
      to: toEmail,
      subject: `Grant draft ready: ${params.grantName}`,
      html: `<p>Your educational grant draft is ready for review.</p><p>Grant: <strong>${params.grantName}</strong></p><p>Draft ID: ${params.draftId}</p><p>Educational only. No guarantees of outcomes.</p>`,
      text: `Your educational grant draft is ready. Grant: ${params.grantName}. Draft ID: ${params.draftId}. Educational only. No guarantees of outcomes.`,
      template_key: "grants_draft_ready",
      user_id: params.userId,
      data: {
        draft_id: params.draftId,
        grant_name: params.grantName,
      },
    }),
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "Supabase environment is not configured." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Missing bearer token." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const authRes = await userClient.auth.getUser();
  if (authRes.error || !authRes.data.user?.id) {
    return json(401, { error: "Unauthorized." });
  }

  const userId = authRes.data.user.id;

  let body: Record<string, unknown> = {};
  try {
    body = asObject(await req.json());
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const route = parseRoute(new URL(req.url).pathname, normalizeString(body.action).toLowerCase());
  if (!route) {
    return json(404, { error: "Route not found." });
  }

  try {
    if (route === "shortlist") {
      const payload = body as ShortlistBody;
      const clientFileId = normalizeString(payload.client_file_id);
      if (!clientFileId) return json(400, { error: "client_file_id is required." });

      const tenantId = await resolveTenantIdForUser(serviceClient, userId);
      if (!tenantId) return json(400, { error: "Unable to resolve tenant." });

      await requirePremiumTier({
        serviceClient,
        userId,
        tenantId,
      });

      const snapshot = await loadClientSnapshot({
        serviceClient,
        tenantId,
        userId,
        clientFileId,
      });

      const filterGeo = asArrayOfStrings(asObject(payload.filters).geography);
      const filterTags = asArrayOfStrings(asObject(payload.filters).tags);

      const catalogRes = await serviceClient
        .from("grants_catalog")
        .select("id,source,name,sponsor,url,geography,industry_tags,eligibility_md,award_range_md,deadline_date")
        .eq("is_active", true)
        .limit(300);

      if (catalogRes.error) {
        return json(400, { error: catalogRes.error.message || "Unable to load grants catalog." });
      }

      const catalog = (catalogRes.data || []) as GrantCatalogRow[];
      const shortlist = catalog
        .filter((grant) => {
          const geoOk = hasOverlap(grant.geography, filterGeo.length ? filterGeo : [snapshot.region.toLowerCase()]);
          const tagOk = hasOverlap(grant.industry_tags, filterTags.length ? filterTags : snapshot.industry_tags);
          return geoOk && tagOk;
        })
        .map((grant) => rankGrant(grant, snapshot, { geography: filterGeo, tags: filterTags }))
        .filter((ranked) => ranked.match_score > 0)
        .sort((a, b) => b.match_score - a.match_score)
        .slice(0, 25);

      const upsertRows = shortlist.map((ranked) => ({
        tenant_id: tenantId,
        user_id: userId,
        client_file_id: clientFileId,
        status: "shortlisted",
        grant_id: ranked.grant.id,
        match_score: ranked.match_score,
        match_reasons: ranked.reasons,
        notes_md: "Educational shortlist only. Client decides and submits applications.",
      }));

      const upsertRes = await serviceClient
        .from("grant_matches")
        .upsert(upsertRows, { onConflict: "tenant_id,user_id,client_file_id,grant_id" })
        .select("id");

      if (upsertRes.error) {
        return json(400, { error: upsertRes.error.message || "Unable to create grant shortlist matches." });
      }

      await createShortlistTasks({
        serviceClient,
        tenantId,
        userId,
        clientFileId,
        shortlisted: shortlist,
      });

      await writeAuditEvent({
        serviceClient,
        tenantId,
        actorUserId: userId,
        eventType: "grants.shortlist.created",
        metadata: {
          entity_id: clientFileId,
          client_file_id: clientFileId,
          match_count: (upsertRes.data || []).length,
          filters: {
            geography: filterGeo,
            tags: filterTags,
          },
        },
      });

      return json(200, {
        success: true,
        match_ids: ((upsertRes.data || []) as Array<{ id: string }>).map((row) => row.id),
      });
    }

    if (route === "draft") {
      const payload = body as DraftBody;
      const grantMatchId = normalizeString(payload.grant_match_id);
      if (!grantMatchId) return json(400, { error: "grant_match_id is required." });

      const grantMatchRes = await serviceClient
        .from("grant_matches")
        .select("id,tenant_id,user_id,client_file_id,grant_id,status")
        .eq("id", grantMatchId)
        .limit(1)
        .maybeSingle();

      if (grantMatchRes.error || !grantMatchRes.data) {
        return json(404, { error: grantMatchRes.error?.message || "Grant match not found." });
      }

      const match = grantMatchRes.data as GrantMatchRow;
      const canManage = await isTenantManager(userClient, match.tenant_id);
      if (match.user_id !== userId && !canManage) {
        return json(403, { error: "Unauthorized grant match access." });
      }

      await requirePremiumTier({
        serviceClient,
        userId: match.user_id,
        tenantId: match.tenant_id,
      });
      await requireDraftConsents(serviceClient, match.user_id);

      const grantRes = await serviceClient
        .from("grants_catalog")
        .select("id,source,name,sponsor,url,geography,industry_tags,eligibility_md,award_range_md,deadline_date")
        .eq("id", match.grant_id)
        .limit(1)
        .maybeSingle();

      if (grantRes.error || !grantRes.data) {
        return json(404, { error: grantRes.error?.message || "Grant catalog row not found." });
      }

      const grant = grantRes.data as GrantCatalogRow;
      const snapshot = await loadClientSnapshot({
        serviceClient,
        tenantId: match.tenant_id,
        userId: match.user_id,
        clientFileId: match.client_file_id,
      });

      let generated = {
        draft_md: fallbackDraft(grant, snapshot),
        provider: "rule_based",
        mode: "fallback",
      } as { draft_md: string; provider: string; mode: string; raw?: unknown };

      try {
        generated = await tryGenerateViaAiTaskRunner({
          supabaseUrl,
          anonKey,
          authHeader,
          grant,
          snapshot,
        });
      } catch {
        generated = {
          draft_md: fallbackDraft(grant, snapshot),
          provider: "rule_based",
          mode: "fallback",
        };
      }

      const draftRes = await serviceClient
        .from("grant_application_drafts")
        .insert({
          tenant_id: match.tenant_id,
          user_id: match.user_id,
          client_file_id: match.client_file_id,
          grant_match_id: match.id,
          status: "needs_review",
          draft_md: generated.draft_md,
          draft_json: {
            provider: generated.provider,
            mode: generated.mode,
            educational_only: true,
            no_guarantee: true,
          },
        })
        .select("id,tenant_id,user_id,status,draft_md")
        .single();

      if (draftRes.error || !draftRes.data?.id) {
        return json(400, { error: draftRes.error?.message || "Unable to store grant draft." });
      }

      const draft = draftRes.data as DraftRow;
      const hash = await sha256Hex(draft.draft_md || "");

      const documentRes = await serviceClient
        .from("documents")
        .upsert({
          tenant_id: match.tenant_id,
          user_id: match.user_id,
          category: "grants",
          title: `Grant Draft - ${grant.name}`,
          status: "needs_review",
          source_type: "manual",
          source_id: draft.id,
          storage_path: null,
          content_hash: hash,
        }, { onConflict: "source_type,source_id" })
        .select("id")
        .single();

      if (documentRes.error || !documentRes.data?.id) {
        return json(400, { error: documentRes.error?.message || "Unable to create document row for grant draft." });
      }

      await serviceClient
        .from("grant_matches")
        .update({ status: "drafting" })
        .eq("id", match.id);

      await sendDraftReadyEmail({
        serviceClient,
        supabaseUrl,
        anonKey,
        authHeader,
        userId: match.user_id,
        draftId: draft.id,
        grantName: grant.name,
      });

      await writeAuditEvent({
        serviceClient,
        tenantId: match.tenant_id,
        actorUserId: userId,
        eventType: "grants.draft.created",
        metadata: {
          entity_id: draft.id,
          grant_match_id: match.id,
          grant_id: grant.id,
          document_id: String(documentRes.data.id),
          provider: generated.provider,
          mode: generated.mode,
        },
      });

      return json(200, {
        success: true,
        draft_id: draft.id,
        document_id: String(documentRes.data.id),
      });
    }

    if (route === "mark-approved") {
      const payload = body as MarkApprovedBody;
      const documentId = normalizeString(payload.document_id);
      if (!documentId) return json(400, { error: "document_id is required." });

      const documentRes = await serviceClient
        .from("documents")
        .select("id,tenant_id,user_id,source_type,source_id,category")
        .eq("id", documentId)
        .eq("category", "grants")
        .limit(1)
        .maybeSingle();

      if (documentRes.error || !documentRes.data) {
        return json(404, { error: documentRes.error?.message || "Grant document not found." });
      }

      const document = documentRes.data as Record<string, unknown>;
      const ownerId = normalizeString(document.user_id);
      if (ownerId !== userId) {
        return json(403, { error: "Only the client owner can authorize grant submissions." });
      }

      const draftId = normalizeString(document.source_id);
      if (!draftId) {
        return json(400, { error: "Document is not linked to a draft source." });
      }

      const draftRes = await serviceClient
        .from("grant_application_drafts")
        .select("id,tenant_id,user_id,status")
        .eq("id", draftId)
        .limit(1)
        .maybeSingle();

      if (draftRes.error || !draftRes.data) {
        return json(404, { error: draftRes.error?.message || "Grant draft not found for document." });
      }

      const draft = draftRes.data as DraftRow;
      const policyVersionId = await resolveLatestPolicyVersionId(serviceClient);
      const acceptedAt = new Date().toISOString();
      const ipHash = await sha256Hex(`${userId}:${documentId}:${acceptedAt}:grant_approval`);
      const userAgent = normalizeString(req.headers.get("User-Agent")) || "unknown";

      const approvals = [
        {
          tenant_id: normalizeString(document.tenant_id),
          user_id: userId,
          document_id: documentId,
          approval_type: "review_ack",
          policy_version_id: policyVersionId,
          approved_at: acceptedAt,
          ip_hash: ipHash,
          user_agent: userAgent,
          notes: "Client reviewed grant draft for educational use and accuracy.",
        },
        {
          tenant_id: normalizeString(document.tenant_id),
          user_id: userId,
          document_id: documentId,
          approval_type: "authorize_submit",
          policy_version_id: policyVersionId,
          approved_at: acceptedAt,
          ip_hash: ipHash,
          user_agent: userAgent,
          notes: "Client explicitly authorized grant submission workflow.",
        },
      ];

      const approvalRes = await serviceClient
        .from("document_approvals")
        .upsert(approvals, { onConflict: "document_id,user_id,approval_type" });

      if (approvalRes.error) {
        return json(400, { error: approvalRes.error.message || "Unable to record grant document approvals." });
      }

      await serviceClient
        .from("grant_application_drafts")
        .update({ status: "approved_to_submit" })
        .eq("id", draft.id);

      await writeAuditEvent({
        serviceClient,
        tenantId: draft.tenant_id,
        actorUserId: userId,
        eventType: "grants.draft.approved",
        metadata: {
          entity_id: draft.id,
          document_id: documentId,
          policy_version_id: policyVersionId,
        },
      });

      return json(200, {
        success: true,
        document_id: documentId,
        draft_id: draft.id,
      });
    }

    if (route === "mark-submitted") {
      const payload = body as MarkSubmittedBody;
      const grantMatchId = normalizeString(payload.grant_match_id);
      const submissionMethod = normalizeString(payload.submission_method);
      const confirmationRef = normalizeString(payload.confirmation_ref) || null;

      if (!grantMatchId) return json(400, { error: "grant_match_id is required." });
      if (!["client_self_submit", "assisted_submit"].includes(submissionMethod)) {
        return json(400, { error: "submission_method must be client_self_submit or assisted_submit." });
      }

      const matchRes = await serviceClient
        .from("grant_matches")
        .select("id,tenant_id,user_id,grant_id,status")
        .eq("id", grantMatchId)
        .limit(1)
        .maybeSingle();

      if (matchRes.error || !matchRes.data) {
        return json(404, { error: matchRes.error?.message || "Grant match not found." });
      }

      const match = matchRes.data as GrantMatchRow;
      const canManage = await isTenantManager(userClient, match.tenant_id);
      if (match.user_id !== userId && !canManage) {
        return json(403, { error: "Unauthorized match access." });
      }

      if (submissionMethod === "assisted_submit") {
        const draftRes = await serviceClient
          .from("grant_application_drafts")
          .select("id,status")
          .eq("grant_match_id", match.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (draftRes.error || !draftRes.data?.id) {
          return json(412, { error: "No grant draft found for assisted submit flow." });
        }

        const draft = draftRes.data as Record<string, unknown>;
        if (!["approved_to_submit", "submitted"].includes(normalizeString(draft.status))) {
          return json(412, { error: "Grant draft must be approved before assisted submit." });
        }

        const docRes = await serviceClient
          .from("documents")
          .select("id")
          .eq("source_type", "manual")
          .eq("source_id", normalizeString(draft.id))
          .eq("category", "grants")
          .limit(1)
          .maybeSingle();

        if (docRes.error || !docRes.data?.id) {
          return json(412, { error: "Document approval record is required before assisted submit." });
        }

        const approvalRes = await serviceClient
          .from("document_approvals")
          .select("id")
          .eq("document_id", String(docRes.data.id))
          .eq("approval_type", "authorize_submit")
          .eq("user_id", match.user_id)
          .limit(1)
          .maybeSingle();

        if (approvalRes.error || !approvalRes.data?.id) {
          return json(412, { error: "Client authorize_submit approval is required before assisted submit." });
        }
      }

      const submittedAt = new Date().toISOString();

      const submissionRes = await serviceClient
        .from("grant_submissions")
        .upsert({
          tenant_id: match.tenant_id,
          user_id: match.user_id,
          grant_match_id: match.id,
          submission_method: submissionMethod,
          submitted_at: submittedAt,
          confirmation_ref: confirmationRef,
          status: "pending",
          payload_meta: {
            recorded_by: userId,
            educational_only: true,
            no_guarantee: true,
          },
        }, { onConflict: "grant_match_id,submission_method" })
        .select("id,status")
        .single();

      if (submissionRes.error || !submissionRes.data?.id) {
        return json(400, { error: submissionRes.error?.message || "Unable to record grant submission." });
      }

      await serviceClient
        .from("grant_matches")
        .update({ status: "submitted" })
        .eq("id", match.id);

      await serviceClient
        .from("grant_application_drafts")
        .update({ status: "submitted" })
        .eq("grant_match_id", match.id)
        .in("status", ["approved_to_submit", "needs_review", "draft"]);

      await writeAuditEvent({
        serviceClient,
        tenantId: match.tenant_id,
        actorUserId: userId,
        eventType: "grants.submission.recorded",
        metadata: {
          entity_id: String(submissionRes.data.id),
          grant_match_id: match.id,
          submission_method: submissionMethod,
          confirmation_ref: confirmationRef,
        },
      });

      return json(200, {
        success: true,
        submission_id: String(submissionRes.data.id),
        status: String(submissionRes.data.status || "pending"),
      });
    }

    return json(404, { error: "Unsupported route." });
  } catch (error) {
    return json(400, {
      error: normalizeString((error as Error)?.message || error),
    });
  }
});
