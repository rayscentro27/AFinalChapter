import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { piiScanPayload } from "../_shared/piiScanner.ts";

type GenerateBody = {
  client_file_id?: unknown;
  action?: unknown;
};

type SubscriptionRow = {
  plan_code?: string | null;
  tier?: string | null;
  status?: string | null;
};

type ConsentStatusRow = {
  disclaimers_accepted?: boolean;
};

type BankCatalogRow = {
  id: string;
  name: string;
  regions: string[] | null;
  products: unknown;
  requirements: Record<string, unknown> | null;
  notes_md: string | null;
};

type ProductOption = {
  key: string;
  type: string;
  label: string;
  intro_apr_percent: number | null;
  intro_apr_months: number | null;
  max_limit_cents: number | null;
  min_credit_score?: number | null;
};

type Recommendation = {
  rank: number;
  bank_id: string;
  bank_name: string;
  product_key: string;
  product_type: string;
  product_label: string;
  intro_apr_percent: number | null;
  intro_apr_months: number | null;
  estimated_max_limit_cents: number | null;
  score: number;
  reason_codes: string[];
  rationale: string;
};

type FundingProfile = {
  region: string;
  creditScore: number;
  utilizationPct: number;
  hasMajorDerog: boolean;
  yearsInBusiness: number;
  lowRisk: boolean;
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

function normalizeRoute(pathname: string, action: string): "generate" | null {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith("/generate")) return "generate";
  if (normalized.endsWith("/funding-research")) return "generate";
  if (action === "generate") return "generate";
  return null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = normalizeString(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function toIsoDateOffset(daysFromNow: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + daysFromNow);
  return dt.toISOString().slice(0, 10);
}

function normalizeTier(value: unknown): "free" | "growth" | "premium" {
  const raw = normalizeString(value).toLowerCase();
  if (raw === "premium") return "premium";
  if (raw === "growth") return "growth";
  return "free";
}

function normalizeSubscriptionStatus(value: unknown): string {
  const raw = normalizeString(value).toLowerCase();
  if (!raw) return "active";
  return raw;
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

async function checkPremiumEntitlement(params: {
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
  userId: string;
  tenantId: string;
}): Promise<boolean> {
  const rpcRes = await params.userClient.rpc("can_access_feature", {
    p_user_id: params.userId,
    p_feature_key: "FUNDING_SEQUENCE",
  });

  if (!rpcRes.error) {
    return Boolean(rpcRes.data);
  }

  const subRes = await params.serviceClient
    .from("subscriptions")
    .select("plan_code,tier,status")
    .eq("user_id", params.userId)
    .eq("tenant_id", params.tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subRes.error || !subRes.data) {
    return false;
  }

  const row = subRes.data as SubscriptionRow;
  const tier = normalizeTier(row.tier || row.plan_code);
  const status = normalizeSubscriptionStatus(row.status);
  return tier === "premium" && (status === "active" || status === "trialing");
}

async function checkRequiredFundingConsents(serviceClient: SupabaseClient, userId: string): Promise<{
  disclaimersAccepted: boolean;
  commissionAccepted: boolean;
}> {
  const [statusRes, commissionRes] = await Promise.all([
    serviceClient
      .from("user_consent_status")
      .select("disclaimers_accepted")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    serviceClient
      .from("consents")
      .select("id")
      .eq("user_id", userId)
      .eq("consent_type", "commission_disclosure")
      .order("accepted_at", { ascending: false })
      .limit(1),
  ]);

  const disclaimersAccepted = !statusRes.error && Boolean((statusRes.data as ConsentStatusRow | null)?.disclaimers_accepted);
  const commissionAccepted = !commissionRes.error && Array.isArray(commissionRes.data) && commissionRes.data.length > 0;

  return {
    disclaimersAccepted,
    commissionAccepted,
  };
}

function removePotentialPii(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => removePotentialPii(item));
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      const looksPii = [
        "name",
        "address",
        "dob",
        "birth",
        "ssn",
        "social",
        "email",
        "phone",
        "account_number",
        "full_account",
        "routing",
        "tax_id",
      ].some((needle) => lower.includes(needle));

      if (looksPii) continue;
      next[key] = removePotentialPii(val);
    }

    return next;
  }

  if (typeof value === "string") {
    return value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
      .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, "[REDACTED_SSN]")
      .replace(/\b\d{10,16}\b/g, "[REDACTED_NUMBER]");
  }

  return value;
}

async function loadStatusJsonFromClientFile(params: {
  serviceClient: SupabaseClient;
  userId: string;
  clientFileId: string;
}): Promise<{ statusJson: Record<string, unknown> | null; region: string | null }> {
  const primary = await params.serviceClient
    .from("client_files")
    .select("id,user_id,status_json,region,state")
    .eq("id", params.clientFileId)
    .eq("user_id", params.userId)
    .limit(1)
    .maybeSingle();

  if (!primary.error && primary.data) {
    const row = primary.data as Record<string, unknown>;
    return {
      statusJson: asObject(row.status_json),
      region: normalizeString(row.region || row.state).toUpperCase() || null,
    };
  }

  // Compatibility fallback when client_files table is not present in the local schema.
  if (primary.error && String(primary.error.message || "").toLowerCase().includes("client_files")) {
    return { statusJson: null, region: null };
  }

  if (primary.error) {
    throw new Error(primary.error.message || "Unable to load client file.");
  }

  return { statusJson: null, region: null };
}

async function buildSanitizedSnapshot(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  userId: string;
  clientFileId: string;
}): Promise<Record<string, unknown>> {
  const { statusJson, region: fileRegion } = await loadStatusJsonFromClientFile(params);

  const [profileRes, scoresRes] = await Promise.all([
    params.serviceClient
      .from("tenant_profiles")
      .select("credit_score_est,has_major_derog,utilization_pct,months_reserves,docs_ready")
      .eq("tenant_id", params.tenantId)
      .limit(1)
      .maybeSingle(),
    params.serviceClient
      .from("client_scores")
      .select("fundability_score,capital_readiness_index,financial_health_score,risk_profile,underwriting_readiness")
      .eq("client_id", params.tenantId)
      .limit(1)
      .maybeSingle(),
  ]);

  const statusObj = asObject(statusJson);
  const profile = asObject(profileRes.data);
  const scores = asObject(scoresRes.data);

  const mergedSnapshot = {
    source: statusJson ? "client_files.status_json" : "tenant_profiles+client_scores",
    generated_at: new Date().toISOString(),
    tenant_id: params.tenantId,
    user_id: params.userId,
    client_file_id: params.clientFileId,
    region: fileRegion
      || normalizeString(statusObj.region || statusObj.state || profile.state).toUpperCase()
      || "US",
    credit_readiness: {
      credit_score_est: clampInt(asNumber(statusObj.credit_score_est ?? profile.credit_score_est, 650), 300, 900),
      utilization_pct: clampInt(asNumber(statusObj.utilization_pct ?? profile.utilization_pct, 40), 0, 100),
      has_major_derog: normalizeBool(statusObj.has_major_derog ?? profile.has_major_derog),
      months_reserves: clampInt(asNumber(statusObj.months_reserves ?? profile.months_reserves, 1), 0, 60),
      docs_ready: normalizeBool(statusObj.docs_ready ?? profile.docs_ready ?? true),
      years_in_business: clampInt(asNumber(statusObj.years_in_business ?? statusObj.time_in_business_years ?? 1), 0, 99),
    },
    readiness_scores: {
      fundability_score: clampInt(asNumber(statusObj.fundability_score ?? scores.fundability_score, 0), 0, 100),
      capital_readiness_index: clampInt(asNumber(statusObj.capital_readiness_index ?? scores.capital_readiness_index, 0), 0, 100),
      underwriting_readiness: clampInt(asNumber(statusObj.underwriting_readiness ?? scores.underwriting_readiness, 0), 0, 100),
      risk_profile: clampInt(asNumber(statusObj.risk_profile ?? scores.risk_profile, 50), 0, 100),
    },
    policy: {
      educational_only: true,
      no_guarantee: true,
      client_driven_submission: true,
    },
  };

  const sanitized = removePotentialPii(mergedSnapshot) as Record<string, unknown>;
  return sanitized;
}

function deriveFundingProfile(snapshot: Record<string, unknown>): FundingProfile {
  const readiness = asObject(snapshot.credit_readiness);
  const score = clampInt(asNumber(readiness.credit_score_est, 650), 300, 900);
  const utilization = clampInt(asNumber(readiness.utilization_pct, 40), 0, 100);
  const hasMajorDerog = normalizeBool(readiness.has_major_derog);
  const yearsInBusiness = clampInt(asNumber(readiness.years_in_business, 1), 0, 99);
  const lowRisk = score >= 680 && utilization <= 40 && !hasMajorDerog;

  return {
    region: normalizeString(snapshot.region).toUpperCase() || "US",
    creditScore: score,
    utilizationPct: utilization,
    hasMajorDerog,
    yearsInBusiness,
    lowRisk,
  };
}

function parseProducts(value: unknown): ProductOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, idx) => {
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      const key = normalizeString(obj.key) || `PRODUCT_${idx + 1}`;
      const type = normalizeString(obj.type).toLowerCase() || "card";
      const label = normalizeString(obj.label) || key.replaceAll("_", " ");
      return {
        key,
        type,
        label,
        intro_apr_percent: Number.isFinite(Number(obj.intro_apr_percent)) ? Number(obj.intro_apr_percent) : null,
        intro_apr_months: Number.isFinite(Number(obj.intro_apr_months)) ? Number(obj.intro_apr_months) : null,
        max_limit_cents: Number.isFinite(Number(obj.max_limit_cents)) ? Number(obj.max_limit_cents) : null,
        min_credit_score: Number.isFinite(Number(obj.min_credit_score)) ? Number(obj.min_credit_score) : null,
      } as ProductOption;
    })
    .filter((item): item is ProductOption => Boolean(item));
}

function isRegionMatch(bankRegions: string[] | null, userRegion: string): boolean {
  const normalizedRegions = Array.isArray(bankRegions)
    ? bankRegions.map((item) => normalizeString(item).toUpperCase()).filter(Boolean)
    : [];

  if (normalizedRegions.length === 0) return true;
  if (normalizedRegions.includes("US")) return true;
  return normalizedRegions.includes(userRegion);
}

function rankProduct(params: {
  bank: BankCatalogRow;
  product: ProductOption;
  profile: FundingProfile;
}): Recommendation {
  const reasons: string[] = [];
  let score = 40;

  if (isRegionMatch(params.bank.regions, params.profile.region)) {
    score += 10;
    reasons.push("region_match");
  } else {
    score -= 25;
    reasons.push("region_limited");
  }

  const introMonths = Number(params.product.intro_apr_months || 0);
  if (introMonths > 0) {
    score += Math.min(introMonths, 18);
    reasons.push("zero_apr_intro");
  }

  const req = asObject(params.bank.requirements);
  const requiredScore = clampInt(asNumber(params.product.min_credit_score ?? req.min_credit_score, 680), 300, 900);

  if (params.profile.creditScore >= requiredScore) {
    score += 15;
    reasons.push("meets_credit_guideline");
  } else {
    score -= 20;
    reasons.push("credit_gap_review_needed");
  }

  if (params.profile.lowRisk) {
    score += 12;
    reasons.push("low_risk_profile");
  } else {
    score -= 6;
    reasons.push("risk_review_recommended");
  }

  if (params.profile.yearsInBusiness >= asNumber(req.preferred_years_in_business, 1)) {
    score += 8;
    reasons.push("time_in_business_alignment");
  }

  const relationshipHint = normalizeString(req.relationship_banking_hint);
  if (relationshipHint) {
    reasons.push("relationship_banking_hint");
  }

  return {
    rank: 0,
    bank_id: params.bank.id,
    bank_name: params.bank.name,
    product_key: params.product.key,
    product_type: params.product.type,
    product_label: params.product.label,
    intro_apr_percent: params.product.intro_apr_percent,
    intro_apr_months: params.product.intro_apr_months,
    estimated_max_limit_cents: params.product.max_limit_cents,
    score,
    reason_codes: reasons,
    rationale: "Educational ranking based on region fit, profile readiness signals, and published intro APR guidance. Client decides and submits applications.",
  };
}

async function buildRecommendations(params: {
  serviceClient: SupabaseClient;
  snapshot: Record<string, unknown>;
}): Promise<Recommendation[]> {
  const profile = deriveFundingProfile(params.snapshot);

  const catalogRes = await params.serviceClient
    .from("bank_catalog")
    .select("id,name,regions,products,requirements,notes_md")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(200);

  if (catalogRes.error) {
    throw new Error(catalogRes.error.message || "Unable to load bank catalog.");
  }

  const rows = (catalogRes.data || []) as BankCatalogRow[];
  const ranked: Recommendation[] = [];

  for (const bank of rows) {
    if (!isRegionMatch(bank.regions, profile.region)) continue;

    const products = parseProducts(bank.products);
    for (const product of products) {
      ranked.push(rankProduct({ bank, product, profile }));
    }
  }

  const sorted = ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return sorted;
}

async function createPacketTasks(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  userId: string;
  packetId: string;
}) {
  const rows = [
    {
      task_id: `funding:${params.packetId}:review_packet`,
      title: "FUNDING.REVIEW_PACKET",
      description: "Review your educational bank research packet. No guarantee of approval or funding outcome.",
      due_date: toIsoDateOffset(2),
      type: "review",
      meta: {
        source: "funding_research",
        task_key: "FUNDING.REVIEW_PACKET",
        packet_id: params.packetId,
      },
    },
    {
      task_id: `funding:${params.packetId}:application_checklist`,
      title: "FUNDING.APPLICATION_CHECKLIST",
      description: "Prepare your own client-driven application checklist and submission sequence.",
      due_date: toIsoDateOffset(5),
      type: "action",
      meta: {
        source: "funding_research",
        task_key: "FUNDING.APPLICATION_CHECKLIST",
        packet_id: params.packetId,
      },
    },
    {
      task_id: `funding:${params.packetId}:results_logging`,
      title: "FUNDING.RESULTS_LOGGING",
      description: "Log your application outcomes in the tracker. Results vary and are not guaranteed.",
      due_date: toIsoDateOffset(21),
      type: "review",
      meta: {
        source: "funding_research",
        task_key: "FUNDING.RESULTS_LOGGING",
        packet_id: params.packetId,
      },
    },
  ];

  const payload = rows.map((row) => ({
    tenant_id: params.tenantId,
    user_id: params.userId,
    task_id: row.task_id,
    title: row.title,
    description: row.description,
    status: "pending",
    due_date: row.due_date,
    type: row.type,
    meta: row.meta,
  }));

  await params.serviceClient.from("client_tasks").upsert(payload, { onConflict: "tenant_id,task_id" });
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
    entity_type: "funding_research",
    entity_id: String(params.metadata.packet_id || "packet"),
    metadata: params.metadata,
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  let body: GenerateBody = {};
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const route = normalizeRoute(new URL(req.url).pathname, normalizeString(body.action).toLowerCase());
  if (route !== "generate") {
    return json(404, { error: "Not found." });
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
  const clientFileId = normalizeString(body.client_file_id);

  if (!clientFileId) {
    return json(400, { error: "client_file_id is required." });
  }

  const tenantId = await resolveTenantIdForUser(serviceClient, userId);
  if (!tenantId) {
    return json(400, { error: "Unable to resolve tenant for current user." });
  }

  const premiumAllowed = await checkPremiumEntitlement({
    userClient,
    serviceClient,
    userId,
    tenantId,
  });

  const consents = await checkRequiredFundingConsents(serviceClient, userId);
  const missing: string[] = [];

  if (!premiumAllowed) {
    missing.push("premium_tier_or_funding_entitlement");
  }
  if (!consents.disclaimersAccepted) {
    missing.push("disclaimers");
  }
  if (!consents.commissionAccepted) {
    missing.push("commission_disclosure");
  }

  if (missing.length > 0) {
    return json(403, {
      error: "Funding research generation is gated by tier and required consents.",
      missing,
    });
  }

  const snapshot = await buildSanitizedSnapshot({
    serviceClient,
    tenantId,
    userId,
    clientFileId,
  });

  const scan = piiScanPayload(snapshot);
  if (scan.blocked) {
    return json(412, {
      error: "Sanitized packet still contains potential PII. Generation blocked.",
      findings: scan.findings.slice(0, 40),
    });
  }

  const recommendations = await buildRecommendations({
    serviceClient,
    snapshot,
  });

  const packetRes = await serviceClient
    .from("funding_research_packets")
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      client_file_id: clientFileId,
      status: "delivered",
      input_snapshot: snapshot,
      recommendations,
    })
    .select("id")
    .single();

  if (packetRes.error || !packetRes.data?.id) {
    return json(400, { error: packetRes.error?.message || "Unable to store funding research packet." });
  }

  const packetId = String(packetRes.data.id);
  const contentHash = await sha256Hex(JSON.stringify({ snapshot, recommendations }));

  const documentRes = await serviceClient
    .from("documents")
    .upsert({
      tenant_id: tenantId,
      user_id: userId,
      category: "funding",
      title: `Bank Research Packet - ${new Date().toISOString().slice(0, 10)}`,
      status: "needs_review",
      source_type: "manual",
      source_id: packetId,
      storage_path: null,
      content_hash: contentHash,
    }, { onConflict: "source_type,source_id" })
    .select("id")
    .single();

  if (documentRes.error || !documentRes.data?.id) {
    return json(400, { error: documentRes.error?.message || "Unable to create funding packet document row." });
  }

  await createPacketTasks({
    serviceClient,
    tenantId,
    userId,
    packetId,
  });

  await writeAuditEvent({
    serviceClient,
    tenantId,
    actorUserId: userId,
    eventType: "funding.research_packet.generated",
    metadata: {
      packet_id: packetId,
      document_id: String(documentRes.data.id),
      client_file_id: clientFileId,
      recommendation_count: recommendations.length,
      educational_only: true,
      no_guarantee: true,
      client_submits_applications: true,
    },
  });

  return json(200, {
    success: true,
    packet_id: packetId,
    document_id: String(documentRes.data.id),
    recommendation_count: recommendations.length,
    status: "delivered",
  });
});
