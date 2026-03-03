import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type RouteAction = "create-outcome" | "mark-invoiced" | "mark-paid" | "mark-status";
type OutcomeStatus = "planned" | "applied" | "approved" | "denied";
type CommissionStatus = "estimated" | "invoiced" | "paid" | "waived" | "disputed";
type InvoiceProvider = "stripe" | "manual";

type CreateOutcomeBody = {
  client_file_id?: unknown;
  provider_name?: unknown;
  product_type?: unknown;
  outcome_status?: unknown;
  approved_amount_cents?: unknown;
  evidence_upload_id?: unknown;
  notes_md?: unknown;
  action?: unknown;
};

type MarkInvoicedBody = {
  commission_event_id?: unknown;
  invoice_provider?: unknown;
  invoice_id?: unknown;
  due_date?: unknown;
  action?: unknown;
};

type MarkPaidBody = {
  commission_event_id?: unknown;
  paid_at?: unknown;
  action?: unknown;
};

type MarkStatusBody = {
  commission_event_id?: unknown;
  status?: unknown;
  invoice_provider?: unknown;
  invoice_id?: unknown;
  due_date?: unknown;
  paid_at?: unknown;
  action?: unknown;
};

type SubscriptionRow = {
  tier?: string | null;
  plan_code?: string | null;
  status?: string | null;
};

type ConsentRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  version: string;
  policy_version_id: string | null;
  metadata: Record<string, unknown> | null;
  accepted_at: string;
};

type AgreementRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  version: string;
  rate_bps: number;
  cap_cents: number | null;
  effective_at: string;
  policy_version_id: string;
  consent_id: string;
  created_at: string;
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

function toInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function normalizeInvoiceProvider(value: unknown): InvoiceProvider {
  const raw = normalizeString(value).toLowerCase();
  return raw === "stripe" ? "stripe" : "manual";
}

function normalizeOutcomeStatus(value: unknown): OutcomeStatus {
  const raw = normalizeString(value).toLowerCase();
  if (raw === "applied") return "applied";
  if (raw === "approved") return "approved";
  if (raw === "denied") return "denied";
  return "planned";
}

function normalizeCommissionStatus(value: unknown): CommissionStatus {
  const raw = normalizeString(value).toLowerCase();
  if (raw === "invoiced") return "invoiced";
  if (raw === "paid") return "paid";
  if (raw === "waived") return "waived";
  if (raw === "disputed") return "disputed";
  return "estimated";
}

function normalizeTier(value: unknown): "free" | "growth" | "premium" {
  const raw = normalizeString(value).toLowerCase();
  if (raw === "premium") return "premium";
  if (raw === "growth") return "growth";
  return "free";
}

function normalizeSubStatus(value: unknown): string {
  const raw = normalizeString(value).toLowerCase();
  return raw || "active";
}

function parseRoute(pathname: string, action: string): RouteAction | null {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith("/create-outcome")) return "create-outcome";
  if (normalized.endsWith("/mark-invoiced")) return "mark-invoiced";
  if (normalized.endsWith("/mark-paid")) return "mark-paid";
  if (normalized.endsWith("/mark-status")) return "mark-status";

  if (normalized.endsWith("/commission-ledger")) {
    if (action === "create-outcome") return "create-outcome";
    if (action === "mark-invoiced") return "mark-invoiced";
    if (action === "mark-paid") return "mark-paid";
    if (action === "mark-status") return "mark-status";
  }

  return null;
}

function calculateCommissionCents(baseAmountCents: number, rateBps: number, capCents: number | null): number {
  const base = Math.max(0, Math.trunc(baseAmountCents));
  const bps = Math.max(0, Math.trunc(rateBps));
  let amount = Math.floor((base * bps) / 10000);

  if (capCents !== null && Number.isFinite(capCents)) {
    amount = Math.min(amount, Math.max(0, Math.trunc(capCents)));
  }

  return Math.max(0, amount);
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
  const rpc = await userClient.rpc("nexus_commission_can_manage_tenant", { p_tenant_id: tenantId });
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
  const status = normalizeSubStatus(row?.status);

  if (tier !== "premium" || !["active", "trialing"].includes(status)) {
    throw new Error("Premium subscription with active status is required.");
  }
}

async function getLatestCommissionConsent(params: {
  serviceClient: SupabaseClient;
  userId: string;
  tenantId: string;
}): Promise<ConsentRow | null> {
  const consentRes = await params.serviceClient
    .from("consents")
    .select("id,user_id,tenant_id,version,policy_version_id,metadata,accepted_at")
    .eq("user_id", params.userId)
    .eq("tenant_id", params.tenantId)
    .eq("consent_type", "commission_disclosure")
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (consentRes.error || !consentRes.data) {
    return null;
  }

  return consentRes.data as ConsentRow;
}

async function resolveCommissionPolicyVersionId(serviceClient: SupabaseClient): Promise<string | null> {
  const docRes = await serviceClient
    .from("policy_documents")
    .select("id")
    .eq("key", "commission_disclosure")
    .limit(1)
    .maybeSingle();

  if (docRes.error || !docRes.data?.id) return null;

  const versionRes = await serviceClient
    .from("policy_versions")
    .select("id")
    .eq("document_id", String(docRes.data.id))
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionRes.error || !versionRes.data?.id) return null;
  return String(versionRes.data.id);
}

async function ensureAgreement(params: {
  serviceClient: SupabaseClient;
  userId: string;
  tenantId: string;
  consent: ConsentRow;
}): Promise<AgreementRow> {
  const existing = await params.serviceClient
    .from("commission_agreements")
    .select("id,tenant_id,user_id,version,rate_bps,cap_cents,effective_at,policy_version_id,consent_id,created_at")
    .eq("user_id", params.userId)
    .eq("tenant_id", params.tenantId)
    .order("effective_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing.error && existing.data) {
    return existing.data as AgreementRow;
  }

  const fallbackPolicyVersionId = await resolveCommissionPolicyVersionId(params.serviceClient);
  const policyVersionId = params.consent.policy_version_id || fallbackPolicyVersionId;
  if (!policyVersionId) {
    throw new Error("Published commission disclosure policy version not found.");
  }

  const versionFromMeta = normalizeString(asObject(params.consent.metadata).policy_version);
  const version = versionFromMeta || normalizeString(params.consent.version) || "v1";

  const createRes = await params.serviceClient
    .from("commission_agreements")
    .insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      version,
      rate_bps: 1000,
      cap_cents: null,
      effective_at: new Date().toISOString(),
      policy_version_id: policyVersionId,
      consent_id: params.consent.id,
    })
    .select("id,tenant_id,user_id,version,rate_bps,cap_cents,effective_at,policy_version_id,consent_id,created_at")
    .single();

  if (createRes.error || !createRes.data) {
    throw new Error(createRes.error?.message || "Unable to create commission agreement.");
  }

  return createRes.data as AgreementRow;
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
    entity_type: "commission_ledger",
    entity_id: String(params.metadata.entity_id || "ledger"),
    metadata: params.metadata,
  });
}

async function handleCreateOutcome(params: {
  serviceClient: SupabaseClient;
  userClient: SupabaseClient;
  userId: string;
  body: CreateOutcomeBody;
}): Promise<Response> {
  const tenantId = await resolveTenantIdForUser(params.serviceClient, params.userId);
  if (!tenantId) return json(400, { error: "Unable to resolve tenant context." });

  const clientFileId = normalizeString(params.body.client_file_id);
  const providerName = normalizeString(params.body.provider_name);
  const productType = normalizeString(params.body.product_type).toLowerCase();
  const outcomeStatus = normalizeOutcomeStatus(params.body.outcome_status);
  const approvedAmount = toInteger(params.body.approved_amount_cents);
  const evidenceUploadId = normalizeString(params.body.evidence_upload_id) || null;
  const notes = normalizeString(params.body.notes_md) || null;

  if (!clientFileId) return json(400, { error: "client_file_id is required." });
  if (!providerName) return json(400, { error: "provider_name is required." });
  if (!["card", "loc", "loan"].includes(productType)) {
    return json(400, { error: "product_type must be one of: card, loc, loan." });
  }

  if (outcomeStatus === "approved") {
    if (!approvedAmount || approvedAmount <= 0) {
      return json(400, { error: "approved_amount_cents is required when outcome_status=approved." });
    }

    await requirePremiumTier({
      serviceClient: params.serviceClient,
      userId: params.userId,
      tenantId,
    });
  }

  const outcomeRes = await params.serviceClient
    .from("funding_outcomes")
    .insert({
      tenant_id: tenantId,
      user_id: params.userId,
      client_file_id: clientFileId,
      provider_name: providerName,
      product_type: productType,
      outcome_status: outcomeStatus,
      approved_amount_cents: outcomeStatus === "approved" ? approvedAmount : null,
      approval_date: outcomeStatus === "approved" ? new Date().toISOString().slice(0, 10) : null,
      evidence_upload_id: evidenceUploadId,
      notes_md: notes,
    })
    .select("id,tenant_id,user_id,client_file_id,provider_name,product_type,outcome_status,approved_amount_cents,approval_date,evidence_upload_id,notes_md,created_at,updated_at")
    .single();

  if (outcomeRes.error || !outcomeRes.data?.id) {
    return json(400, { error: outcomeRes.error?.message || "Unable to create funding outcome." });
  }

  const outcome = outcomeRes.data as Record<string, unknown>;
  let commissionEventId: string | null = null;

  if (outcomeStatus === "approved" && approvedAmount && approvedAmount > 0) {
    const consent = await getLatestCommissionConsent({
      serviceClient: params.serviceClient,
      userId: params.userId,
      tenantId,
    });

    if (!consent) {
      return json(412, {
        error: "Commission disclosure consent is required before commission estimation.",
      });
    }

    const agreement = await ensureAgreement({
      serviceClient: params.serviceClient,
      userId: params.userId,
      tenantId,
      consent,
    });

    const commissionAmount = calculateCommissionCents(approvedAmount, agreement.rate_bps, agreement.cap_cents);

    const eventRes = await params.serviceClient
      .from("commission_events")
      .upsert({
        tenant_id: tenantId,
        user_id: params.userId,
        funding_outcome_id: String(outcome.id),
        commission_rate_bps: agreement.rate_bps,
        base_amount_cents: approvedAmount,
        commission_amount_cents: commissionAmount,
        status: "estimated",
        invoice_provider: "manual",
        invoice_id: null,
        due_date: null,
        paid_at: null,
      }, { onConflict: "funding_outcome_id" })
      .select("id,status,commission_rate_bps,base_amount_cents,commission_amount_cents")
      .single();

    if (eventRes.error || !eventRes.data?.id) {
      return json(400, { error: eventRes.error?.message || "Unable to create commission event." });
    }

    commissionEventId = String(eventRes.data.id);

    await writeAuditEvent({
      serviceClient: params.serviceClient,
      tenantId,
      actorUserId: params.userId,
      eventType: "commission.event.estimated",
      metadata: {
        entity_id: commissionEventId,
        funding_outcome_id: String(outcome.id),
        base_amount_cents: approvedAmount,
        commission_rate_bps: agreement.rate_bps,
        commission_amount_cents: commissionAmount,
        agreement_id: agreement.id,
      },
    });
  }

  await writeAuditEvent({
    serviceClient: params.serviceClient,
    tenantId,
    actorUserId: params.userId,
    eventType: "funding.outcome.created",
    metadata: {
      entity_id: String(outcome.id),
      outcome_status: outcomeStatus,
      product_type: productType,
      approved_amount_cents: outcomeStatus === "approved" ? approvedAmount : null,
      commission_event_id: commissionEventId,
    },
  });

  return json(200, {
    success: true,
    outcome_id: String(outcome.id),
    commission_event_id: commissionEventId,
  });
}

async function updateCommissionStatus(params: {
  serviceClient: SupabaseClient;
  userClient: SupabaseClient;
  userId: string;
  commissionEventId: string;
  status: CommissionStatus;
  invoiceProvider?: InvoiceProvider;
  invoiceId?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
}): Promise<Response> {
  const eventRes = await params.serviceClient
    .from("commission_events")
    .select("id,tenant_id,user_id,status,invoice_provider,invoice_id,due_date,paid_at,funding_outcome_id")
    .eq("id", params.commissionEventId)
    .limit(1)
    .maybeSingle();

  if (eventRes.error || !eventRes.data?.id) {
    return json(404, { error: "commission_event_id not found." });
  }

  const row = eventRes.data as Record<string, unknown>;
  const tenantId = String(row.tenant_id || "");
  const isManager = await isTenantManager(params.userClient, tenantId);
  if (!isManager) {
    return json(403, { error: "Admin or super_admin role is required." });
  }

  const patch: Record<string, unknown> = {
    status: params.status,
  };

  if (params.status === "invoiced") {
    patch.invoice_provider = params.invoiceProvider || "manual";
    patch.invoice_id = normalizeString(params.invoiceId) || null;
    patch.due_date = normalizeString(params.dueDate) || null;
    patch.paid_at = null;
  } else if (params.status === "paid") {
    patch.paid_at = normalizeString(params.paidAt) || new Date().toISOString();
  } else {
    if (params.invoiceProvider) patch.invoice_provider = params.invoiceProvider;
    if (params.invoiceId !== undefined) patch.invoice_id = params.invoiceId;
    if (params.dueDate !== undefined) patch.due_date = params.dueDate;
    patch.paid_at = null;
  }

  const updateRes = await params.serviceClient
    .from("commission_events")
    .update(patch)
    .eq("id", params.commissionEventId)
    .select("id,status,invoice_provider,invoice_id,due_date,paid_at,funding_outcome_id,commission_amount_cents")
    .single();

  if (updateRes.error || !updateRes.data?.id) {
    return json(400, { error: updateRes.error?.message || "Unable to update commission event." });
  }

  await writeAuditEvent({
    serviceClient: params.serviceClient,
    tenantId,
    actorUserId: params.userId,
    eventType: "commission.event.status_changed",
    metadata: {
      entity_id: params.commissionEventId,
      funding_outcome_id: String(row.funding_outcome_id || ""),
      from_status: String(row.status || ""),
      to_status: params.status,
      invoice_provider: updateRes.data.invoice_provider,
      invoice_id: updateRes.data.invoice_id,
      due_date: updateRes.data.due_date,
      paid_at: updateRes.data.paid_at,
      commission_amount_cents: updateRes.data.commission_amount_cents,
    },
  });

  return json(200, {
    success: true,
    commission_event_id: String(updateRes.data.id),
    status: String(updateRes.data.status),
  });
}

async function handleMarkInvoiced(params: {
  serviceClient: SupabaseClient;
  userClient: SupabaseClient;
  userId: string;
  body: MarkInvoicedBody;
}): Promise<Response> {
  const commissionEventId = normalizeString(params.body.commission_event_id);
  if (!commissionEventId) return json(400, { error: "commission_event_id is required." });

  return updateCommissionStatus({
    serviceClient: params.serviceClient,
    userClient: params.userClient,
    userId: params.userId,
    commissionEventId,
    status: "invoiced",
    invoiceProvider: normalizeInvoiceProvider(params.body.invoice_provider),
    invoiceId: normalizeString(params.body.invoice_id) || null,
    dueDate: normalizeString(params.body.due_date) || null,
  });
}

async function handleMarkPaid(params: {
  serviceClient: SupabaseClient;
  userClient: SupabaseClient;
  userId: string;
  body: MarkPaidBody;
}): Promise<Response> {
  const commissionEventId = normalizeString(params.body.commission_event_id);
  if (!commissionEventId) return json(400, { error: "commission_event_id is required." });

  return updateCommissionStatus({
    serviceClient: params.serviceClient,
    userClient: params.userClient,
    userId: params.userId,
    commissionEventId,
    status: "paid",
    paidAt: normalizeString(params.body.paid_at) || null,
  });
}

async function handleMarkStatus(params: {
  serviceClient: SupabaseClient;
  userClient: SupabaseClient;
  userId: string;
  body: MarkStatusBody;
}): Promise<Response> {
  const commissionEventId = normalizeString(params.body.commission_event_id);
  if (!commissionEventId) return json(400, { error: "commission_event_id is required." });

  return updateCommissionStatus({
    serviceClient: params.serviceClient,
    userClient: params.userClient,
    userId: params.userId,
    commissionEventId,
    status: normalizeCommissionStatus(params.body.status),
    invoiceProvider: normalizeInvoiceProvider(params.body.invoice_provider),
    invoiceId: normalizeString(params.body.invoice_id) || null,
    dueDate: normalizeString(params.body.due_date) || null,
    paidAt: normalizeString(params.body.paid_at) || null,
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
    body = asObject(await req.json());
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const route = parseRoute(new URL(req.url).pathname, normalizeString(body.action).toLowerCase());
  if (!route) {
    return json(404, { error: "Route not found." });
  }

  try {
    if (route === "create-outcome") {
      return await handleCreateOutcome({
        serviceClient,
        userClient,
        userId,
        body: body as CreateOutcomeBody,
      });
    }

    if (route === "mark-invoiced") {
      return await handleMarkInvoiced({
        serviceClient,
        userClient,
        userId,
        body: body as MarkInvoicedBody,
      });
    }

    if (route === "mark-paid") {
      return await handleMarkPaid({
        serviceClient,
        userClient,
        userId,
        body: body as MarkPaidBody,
      });
    }

    if (route === "mark-status") {
      return await handleMarkStatus({
        serviceClient,
        userClient,
        userId,
        body: body as MarkStatusBody,
      });
    }

    return json(404, { error: "Route not found." });
  } catch (error) {
    return json(400, { error: normalizeString((error as Error)?.message || error) });
  }
});
