import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type CaptureBody = {
  email?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  phone_e164?: unknown;
  marketing_opt_in?: unknown;
  source?: unknown;
  action?: unknown;
};

type UnsubscribeBody = {
  token?: unknown;
  action?: unknown;
};

type RouteAction = "capture" | "unsubscribe";

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

function parseRoute(pathname: string, action: string): RouteAction | null {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith("/capture")) return "capture";
  if (normalized.endsWith("/unsubscribe")) return "unsubscribe";

  if (normalized.endsWith("/lead-capture")) {
    if (action === "capture") return "capture";
    if (action === "unsubscribe") return "unsubscribe";
  }

  return null;
}

function isValidEmail(input: string): boolean {
  if (!input || input.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

function normalizePhoneToE164(value: string): string | null {
  const raw = normalizeString(value);
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
    return null;
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((i) => i.toString(16).padStart(2, "0")).join("");
}

function extractClientIp(req: Request): string {
  const forwarded = normalizeString(req.headers.get("x-forwarded-for"));
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const real = normalizeString(req.headers.get("x-real-ip"));
  if (real) return real;

  const cf = normalizeString(req.headers.get("cf-connecting-ip"));
  if (cf) return cf;

  return "unknown";
}

async function hitRateLimit(params: {
  serviceClient: SupabaseClient;
  scope: string;
  keyHash: string;
  limit: number;
  windowMinutes: number;
}): Promise<boolean> {
  const now = new Date();
  const since = new Date(now.getTime() - params.windowMinutes * 60 * 1000).toISOString();

  const countRes = await params.serviceClient
    .from("lead_capture_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("scope", params.scope)
    .eq("key_hash", params.keyHash)
    .gte("created_at", since);

  const used = Number(countRes.count || 0);
  if (used >= params.limit) {
    return true;
  }

  await params.serviceClient
    .from("lead_capture_rate_limits")
    .insert({
      scope: params.scope,
      key_hash: params.keyHash,
    });

  return false;
}

async function resolveTenantId(serviceClient: SupabaseClient, userId?: string | null): Promise<string | null> {
  const authUserId = normalizeString(userId || "") || null;

  if (authUserId) {
    const preferred = await serviceClient
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", authUserId)
      .limit(1)
      .maybeSingle();

    if (!preferred.error && preferred.data?.tenant_id) {
      return String(preferred.data.tenant_id);
    }

    const fallback = await serviceClient
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", authUserId)
      .limit(1)
      .maybeSingle();

    if (!fallback.error && (fallback.data as Record<string, unknown> | null)?.tenant_id) {
      return String((fallback.data as Record<string, unknown>).tenant_id);
    }
  }

  const first = await serviceClient
    .from("tenants")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!first.error && first.data?.id) {
    return String(first.data.id);
  }

  return null;
}

async function getPublishedPolicy(serviceClient: SupabaseClient, key: string): Promise<{ id: string; version: string; hash: string | null } | null> {
  const doc = await serviceClient
    .from("policy_documents")
    .select("id")
    .eq("key", key)
    .limit(1)
    .maybeSingle();

  if (doc.error || !doc.data?.id) return null;

  const version = await serviceClient
    .from("policy_versions")
    .select("id,version,content_hash")
    .eq("document_id", String(doc.data.id))
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (version.error || !version.data?.id) return null;

  return {
    id: String(version.data.id),
    version: String(version.data.version || "v1"),
    hash: version.data.content_hash ? String(version.data.content_hash) : null,
  };
}

async function getCommsRequiredVersion(serviceClient: SupabaseClient): Promise<string> {
  const req = await serviceClient
    .from("consent_requirements")
    .select("current_version")
    .eq("consent_type", "comms_email")
    .limit(1)
    .maybeSingle();

  if (req.error) return "v1";
  return normalizeString(req.data?.current_version) || "v1";
}

async function upsertLeadEvent(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  leadId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  await params.serviceClient.from("lead_events").insert({
    tenant_id: params.tenantId,
    lead_id: params.leadId,
    event_type: params.eventType,
    payload: params.payload,
  });
}

async function ensureDefaultEnrollment(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  leadId: string;
}) {
  const seq = await params.serviceClient
    .from("funnel_sequences")
    .select("id")
    .eq("key", "default_nurture_v1")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (seq.error || !seq.data?.id) return null;

  const nowIso = new Date().toISOString();

  const enrollment = await params.serviceClient
    .from("funnel_enrollments")
    .upsert({
      tenant_id: params.tenantId,
      lead_id: params.leadId,
      sequence_id: String(seq.data.id),
      status: "enrolled",
      current_step: 0,
      next_run_at: nowIso,
      last_error: null,
    }, { onConflict: "lead_id,sequence_id" })
    .select("id")
    .single();

  if (enrollment.error || !enrollment.data?.id) {
    return null;
  }

  return String(enrollment.data.id);
}

async function issueUnsubscribeToken(params: {
  serviceClient: SupabaseClient;
  leadId: string;
  ttlDays?: number;
}): Promise<string | null> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ttl = Math.max(1, Math.min(180, Math.trunc(params.ttlDays || 90)));
  const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000).toISOString();

  const ins = await params.serviceClient
    .from("unsubscribe_tokens")
    .insert({
      token,
      lead_id: params.leadId,
      expires_at: expiresAt,
    });

  if (ins.error) return null;
  return token;
}

async function resolveLinkedUserId(params: {
  serviceClient: SupabaseClient;
  authUserId: string | null;
  authEmail: string | null;
  leadId: string;
  leadEmail: string;
}): Promise<string | null> {
  if (params.authUserId && params.authEmail && params.authEmail.toLowerCase() === params.leadEmail.toLowerCase()) {
    return params.authUserId;
  }

  const link = await params.serviceClient
    .from("lead_user_links")
    .select("user_id")
    .eq("lead_id", params.leadId)
    .limit(1)
    .maybeSingle();

  if (!link.error && link.data?.user_id) {
    return String(link.data.user_id);
  }

  return null;
}

async function createCommsConsent(params: {
  serviceClient: SupabaseClient;
  userId: string;
  tenantId: string;
  ipHash: string;
  userAgent: string;
  sourcePayload: Record<string, unknown>;
  acceptedAtIso: string;
}): Promise<string | null> {
  const commsRequiredVersion = await getCommsRequiredVersion(params.serviceClient);
  const commsPolicy = await getPublishedPolicy(params.serviceClient, "comms_email");
  const privacyPolicy = await getPublishedPolicy(params.serviceClient, "privacy");

  const meta = {
    source: "lead_capture",
    marketing_opt_in: true,
    comms_required_version: commsRequiredVersion,
    comms_policy_version_id: commsPolicy?.id || null,
    comms_policy_version: commsPolicy?.version || null,
    comms_policy_hash: commsPolicy?.hash || null,
    privacy_policy_version_id: privacyPolicy?.id || null,
    privacy_policy_version: privacyPolicy?.version || null,
    privacy_policy_hash: privacyPolicy?.hash || null,
    source_context: params.sourcePayload,
  };

  const consentRes = await params.serviceClient
    .from("consents")
    .upsert({
      user_id: params.userId,
      tenant_id: params.tenantId,
      consent_type: "comms_email",
      version: commsRequiredVersion,
      accepted_at: params.acceptedAtIso,
      ip_hash: params.ipHash,
      user_agent: params.userAgent,
      policy_version_id: commsPolicy?.id || null,
      metadata: meta,
    }, { onConflict: "user_id,consent_type,version" })
    .select("id")
    .single();

  if (consentRes.error || !consentRes.data?.id) return null;
  return String(consentRes.data.id);
}

async function buildMarketingConsentProof(params: {
  serviceClient: SupabaseClient;
  sourcePayload: Record<string, unknown>;
  acceptedAtIso: string;
  ipHash: string;
  userAgent: string;
  consentId: string | null;
}): Promise<Record<string, unknown>> {
  const commsRequiredVersion = await getCommsRequiredVersion(params.serviceClient);
  const privacyPolicy = await getPublishedPolicy(params.serviceClient, "privacy");
  const commsPolicy = await getPublishedPolicy(params.serviceClient, "comms_email");

  return {
    proof_version: "lead_optin_v1",
    proof_method: params.consentId ? "linked_user_consent" : "lead_optin_snapshot",
    consent_id: params.consentId,
    accepted_at: params.acceptedAtIso,
    ip_hash: params.ipHash,
    user_agent: params.userAgent,
    comms_required_version: commsRequiredVersion,
    comms_policy: commsPolicy,
    privacy_policy: privacyPolicy,
    source_context: params.sourcePayload,
  };
}

async function maybeResolveAuthUser(req: Request, supabaseUrl: string, anonKey: string): Promise<{ userId: string | null; email: string | null }> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { userId: null, email: null };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const authRes = await userClient.auth.getUser();
  if (authRes.error || !authRes.data.user?.id) {
    return { userId: null, email: null };
  }

  return {
    userId: String(authRes.data.user.id),
    email: normalizeString(authRes.data.user.email || "").toLowerCase() || null,
  };
}

async function handleCapture(req: Request, serviceClient: SupabaseClient, supabaseUrl: string, anonKey: string, body: CaptureBody): Promise<Response> {
  const email = normalizeString(body.email).toLowerCase();
  if (!isValidEmail(email)) {
    return json(400, { error: "Valid email is required." });
  }

  const firstName = normalizeString(body.first_name) || null;
  const lastName = normalizeString(body.last_name) || null;
  const phone = normalizePhoneToE164(normalizeString(body.phone_e164));
  const marketingOptIn = Boolean(body.marketing_opt_in === true);
  const sourcePayload = asObject(body.source);

  const clientIp = extractClientIp(req);
  const ipHash = await sha256Hex(clientIp);
  const userAgent = normalizeString(req.headers.get("user-agent") || "unknown") || "unknown";
  const nowIso = new Date().toISOString();

  const blocked = await hitRateLimit({
    serviceClient,
    scope: "lead_capture",
    keyHash: ipHash,
    limit: 30,
    windowMinutes: 15,
  });

  if (blocked) {
    return json(429, { error: "Rate limit exceeded. Try again shortly." });
  }

  const authUser = await maybeResolveAuthUser(req, supabaseUrl, anonKey);
  const tenantId = await resolveTenantId(serviceClient, authUser.userId);
  if (!tenantId) {
    return json(400, { error: "Unable to resolve tenant context." });
  }

  const sourceText = [
    normalizeString(sourcePayload.utm_source),
    normalizeString(sourcePayload.utm_medium),
    normalizeString(sourcePayload.utm_campaign),
    normalizeString(sourcePayload.ref),
  ].filter(Boolean).join("|") || null;

  const existingRes = await serviceClient
    .from("leads")
    .select("id,status,marketing_opt_in,marketing_opt_in_consent_id,first_name,last_name,phone_e164")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  if (existingRes.error && String(existingRes.error.message || "").toLowerCase().includes("permission denied")) {
    return json(403, { error: "Capture blocked by policy." });
  }

  const existing = (existingRes.data || null) as Record<string, unknown> | null;
  const nextStatus = marketingOptIn
    ? "nurturing"
    : normalizeString(existing?.status) || "new";

  const leadRes = await serviceClient
    .from("leads")
    .upsert({
      tenant_id: tenantId,
      email,
      phone_e164: phone || (existing?.phone_e164 ? String(existing.phone_e164) : null),
      first_name: firstName || (existing?.first_name ? String(existing.first_name) : null),
      last_name: lastName || (existing?.last_name ? String(existing.last_name) : null),
      source: sourceText,
      status: nextStatus,
      marketing_opt_in: marketingOptIn || Boolean(existing?.marketing_opt_in),
      marketing_opt_in_consent_id: existing?.marketing_opt_in_consent_id ? String(existing.marketing_opt_in_consent_id) : null,
    }, { onConflict: "tenant_id,email" })
    .select("id,marketing_opt_in,marketing_opt_in_consent_id,status")
    .single();

  if (leadRes.error || !leadRes.data?.id) {
    return json(400, { error: leadRes.error?.message || "Unable to upsert lead." });
  }

  const leadId = String(leadRes.data.id);
  let consentId = leadRes.data.marketing_opt_in_consent_id ? String(leadRes.data.marketing_opt_in_consent_id) : null;
  let consentProof: Record<string, unknown> | null = null;

  if (marketingOptIn) {
    await serviceClient
      .from("esp_contacts")
      .upsert({
        tenant_id: tenantId,
        user_id: authUser.userId || null,
        email,
        full_name: [firstName, lastName].filter(Boolean).join(" ") || null,
        consent_transactional: true,
        consent_marketing: true,
        unsubscribed: false,
        updated_at: nowIso,
      }, {
        onConflict: "tenant_id,email",
      });


    const linkedUserId = await resolveLinkedUserId({
      serviceClient,
      authUserId: authUser.userId,
      authEmail: authUser.email,
      leadId,
      leadEmail: email,
    });

    if (linkedUserId) {
      consentId = await createCommsConsent({
        serviceClient,
        userId: linkedUserId,
        tenantId,
        ipHash,
        userAgent,
        sourcePayload,
        acceptedAtIso: nowIso,
      });

      if (consentId) {
        await serviceClient
          .from("leads")
          .update({
            marketing_opt_in: true,
            marketing_opt_in_consent_id: consentId,
            status: "nurturing",
          })
          .eq("id", leadId);
      }
    }

    consentProof = await buildMarketingConsentProof({
      serviceClient,
      sourcePayload,
      acceptedAtIso: nowIso,
      ipHash,
      userAgent,
      consentId,
    });
  }

  await upsertLeadEvent({
    serviceClient,
    tenantId,
    leadId,
    eventType: "LEAD_CREATED",
    payload: {
      source: sourcePayload,
      source_text: sourceText,
      marketing_opt_in: marketingOptIn,
      consent_id: consentId,
      user_agent: userAgent,
      ip_hash: ipHash,
      is_new: !existing,
      consent_proof: consentProof,
    },
  });

  let enrollmentId: string | null = null;
  let unsubscribeToken: string | null = null;

  if (marketingOptIn) {
    await upsertLeadEvent({
      serviceClient,
      tenantId,
      leadId,
      eventType: "OPTIN_CONFIRMED",
      payload: {
        consent_id: consentId,
        source: sourcePayload,
        user_agent: userAgent,
        ip_hash: ipHash,
        consent_snapshot: consentProof || {},
        consent_proof: consentProof || {},
      },
    });

    enrollmentId = await ensureDefaultEnrollment({
      serviceClient,
      tenantId,
      leadId,
    });

    unsubscribeToken = await issueUnsubscribeToken({
      serviceClient,
      leadId,
      ttlDays: 90,
    });
  }

  return json(200, {
    success: true,
    lead_id: leadId,
    enrollment_id: enrollmentId,
    unsubscribe_token: unsubscribeToken,
  });
}

async function handleUnsubscribe(req: Request, serviceClient: SupabaseClient, body: UnsubscribeBody): Promise<Response> {
  const url = new URL(req.url);
  const token = normalizeString(body.token || url.searchParams.get("token") || "");
  if (!token) {
    return json(400, { error: "token is required." });
  }

  const tokenRes = await serviceClient
    .from("unsubscribe_tokens")
    .select("token,lead_id,expires_at,consumed_at")
    .eq("token", token)
    .limit(1)
    .maybeSingle();

  if (tokenRes.error || !tokenRes.data?.lead_id) {
    return json(404, { error: "Token not found." });
  }

  const tokenRow = tokenRes.data as Record<string, unknown>;
  if (tokenRow.consumed_at) {
    return json(410, { error: "Token already used." });
  }

  const expiresAt = new Date(String(tokenRow.expires_at || ""));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return json(410, { error: "Token expired." });
  }

  const leadRes = await serviceClient
    .from("leads")
    .select("id,tenant_id,email")
    .eq("id", String(tokenRow.lead_id))
    .limit(1)
    .maybeSingle();

  if (leadRes.error || !leadRes.data?.id) {
    return json(404, { error: "Lead not found." });
  }

  const lead = leadRes.data as Record<string, unknown>;
  const tenantId = normalizeString(lead.tenant_id) || null;
  if (!tenantId) {
    return json(400, { error: "Lead tenant not available." });
  }

  await serviceClient
    .from("leads")
    .update({
      marketing_opt_in: false,
      status: "unsubscribed",
    })
    .eq("id", String(lead.id));

  await serviceClient
    .from("funnel_enrollments")
    .update({
      status: "canceled",
      last_error: "unsubscribed",
    })
    .eq("lead_id", String(lead.id))
    .eq("status", "enrolled");

  await serviceClient
    .from("unsubscribe_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", token);

  await upsertLeadEvent({
    serviceClient,
    tenantId,
    leadId: String(lead.id),
    eventType: "LEAD_UNSUBSCRIBED",
    payload: {
      token_used: true,
      source: "unsubscribe_link",
    },
  });

  await serviceClient
    .from("esp_contacts")
    .update({
      unsubscribed: true,
      consent_marketing: false,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("email", normalizeString(lead.email).toLowerCase());

  return json(200, {
    success: true,
    lead_id: String(lead.id),
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

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  let body: Record<string, unknown> = {};
  try {
    body = asObject(await req.json());
  } catch {
    body = {};
  }

  const action = normalizeString(body.action).toLowerCase();
  const route = parseRoute(new URL(req.url).pathname, action);

  if (!route) {
    return json(404, { error: "Route not found." });
  }

  try {
    if (route === "capture") {
      return await handleCapture(req, serviceClient, supabaseUrl, supabaseAnonKey, body as CaptureBody);
    }

    return await handleUnsubscribe(req, serviceClient, body as UnsubscribeBody);
  } catch (error) {
    return json(400, {
      error: normalizeString((error as Error)?.message || error),
    });
  }
});
