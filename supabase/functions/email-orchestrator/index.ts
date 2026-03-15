import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type Provider = "brevo" | "mailerlite";
type MessageType =
  | "transactional"
  | "billing"
  | "system"
  | "onboarding"
  | "reminders"
  | "marketing"
  | "newsletter";

type SendBody = {
  tenant_id?: unknown;
  message_type?: unknown;
  to?: unknown;
  subject?: unknown;
  html?: unknown;
  text?: unknown;
  template_key?: unknown;
  data?: unknown;
  user_id?: unknown;
  to_name?: unknown;
  consent_marketing?: unknown;
  comms_email_accepted?: unknown;
};

type RoutingRuleRow = {
  message_type: MessageType;
  primary_provider: Provider;
  fallback_provider: Provider | null;
  throttle_per_min: number;
};

type ProviderConfigRow = {
  provider: Provider;
  is_enabled: boolean;
  priority: number;
  capabilities: Record<string, unknown>;
  config: Record<string, unknown>;
};

type ContactRow = {
  id: string;
  user_id: string | null;
  consent_transactional: boolean;
  consent_marketing: boolean;
  unsubscribed: boolean;
  tags: string[];
  provider_refs: Record<string, unknown>;
};

type SendAttemptResult = {
  ok: boolean;
  providerMessageId: string | null;
  raw: unknown;
  error: string | null;
  unsupported?: boolean;
  transport?: "brevo" | "mailerlite" | "resend";
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-webhook-signature, x-brevo-signature, x-mailerlite-signature",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const ALLOWED_MESSAGE_TYPES: MessageType[] = [
  "transactional",
  "billing",
  "system",
  "onboarding",
  "reminders",
  "marketing",
  "newsletter",
];

const MARKETING_TYPES: MessageType[] = ["marketing", "newsletter"];

const DEFAULT_ROUTING: Record<MessageType, { primary: Provider; fallback: Provider | null; throttle: number }> = {
  transactional: { primary: "brevo", fallback: null, throttle: 90 },
  billing: { primary: "brevo", fallback: null, throttle: 90 },
  system: { primary: "brevo", fallback: null, throttle: 90 },
  onboarding: { primary: "brevo", fallback: null, throttle: 60 },
  reminders: { primary: "brevo", fallback: null, throttle: 60 },
  marketing: { primary: "mailerlite", fallback: "brevo", throttle: 30 },
  newsletter: { primary: "mailerlite", fallback: "brevo", throttle: 30 },
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

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = normalizeString(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y";
}

function normalizeMessageType(value: unknown): MessageType | null {
  const type = normalizeString(value).toLowerCase() as MessageType;
  return ALLOWED_MESSAGE_TYPES.includes(type) ? type : null;
}

function isMarketingType(messageType: MessageType): boolean {
  return MARKETING_TYPES.includes(messageType);
}

function minuteWindowStartISO(date = new Date()): string {
  const copy = new Date(date);
  copy.setSeconds(0, 0);
  return copy.toISOString();
}

function dedupeProviders(values: Array<Provider | null | undefined>): Provider[] {
  const output: Provider[] = [];
  for (const value of values) {
    if (!value) continue;
    if (!output.includes(value)) output.push(value);
  }
  return output;
}

function extractProviderMessageId(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;

  const direct = obj.messageId ?? obj.message_id ?? obj["message-id"] ?? obj.id;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (typeof direct === "number") return String(direct);

  if (obj.data && typeof obj.data === "object") {
    return extractProviderMessageId(obj.data);
  }

  if (Array.isArray(obj.messages) && obj.messages.length > 0) {
    return extractProviderMessageId(obj.messages[0]);
  }

  return null;
}

function inferWebhookEventType(payload: Record<string, unknown>): string {
  const candidates = [payload.event, payload.event_type, payload.type, payload.status, payload.action];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "unknown";
}

function inferWebhookEmail(payload: Record<string, unknown>): string | null {
  const candidates = [payload.email, payload.to, payload.recipient, payload.email_to];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  }

  if (Array.isArray(payload.to) && payload.to.length > 0 && typeof payload.to[0] === "string") {
    return String(payload.to[0]).trim().toLowerCase();
  }

  if (Array.isArray(payload.recipients) && payload.recipients.length > 0 && typeof payload.recipients[0] === "string") {
    return String(payload.recipients[0]).trim().toLowerCase();
  }

  return null;
}

function mapWebhookStatus(eventTypeRaw: string): string | null {
  const eventType = normalizeString(eventTypeRaw).toLowerCase();
  if (!eventType) return null;
  if (eventType.includes("deliver") || eventType.includes("processed") || eventType.includes("sent")) return "delivered";
  if (eventType.includes("open")) return "opened";
  if (eventType.includes("click")) return "clicked";
  if (eventType.includes("bounce")) return "bounced";
  if (eventType.includes("complain") || eventType.includes("spam")) return "complained";
  if (eventType.includes("unsubscribe") || eventType.includes("unsub")) return "unsubscribed";
  if (eventType.includes("fail") || eventType.includes("reject") || eventType.includes("error")) return "failed";
  return null;
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, "=");
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isServiceRoleBearerToken(token: string, serviceRoleKey: string): boolean {
  if (serviceRoleKey && token === serviceRoleKey) return true;
  const payload = parseJwtPayload(token);
  return normalizeString(payload?.role).toLowerCase() === "service_role";
}

function errorMessageFromProviderResponse(status: number, raw: unknown, fallback: string): string {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const message = obj.message ?? obj.error ?? obj.details;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return `${fallback} (${status})`;
}

function addEducationalFooter(html: string, text: string): { html: string; text: string } {
  const footerLine = "Educational only. No guarantees of outcomes.";
  const htmlFooter = `<hr style=\"margin-top:24px;border:none;border-top:1px solid #e2e8f0\"/><p style=\"font-size:12px;color:#64748b\">${footerLine}</p>`;

  return {
    html: html ? `${html}${htmlFooter}` : `<p>${footerLine}</p>`,
    text: text ? `${text}\n\n${footerLine}` : footerLine,
  };
}

async function resolveTenantId(serviceClient: SupabaseClient, preferredUserId: string | null, requestedTenantId: string | null): Promise<string | null> {
  if (requestedTenantId) return requestedTenantId;

  const userId = preferredUserId || null;
  if (userId) {
    const membershipRes = await serviceClient
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!membershipRes.error && membershipRes.data?.tenant_id) {
      return String(membershipRes.data.tenant_id);
    }

    const legacyRes = await serviceClient
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!legacyRes.error && (legacyRes.data as Record<string, unknown> | null)?.tenant_id) {
      return String((legacyRes.data as Record<string, unknown>).tenant_id);
    }
  }

  const tenantRes = await serviceClient
    .from("tenants")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!tenantRes.error && tenantRes.data?.id) {
    return String(tenantRes.data.id);
  }

  return null;
}

async function canRequesterManageTenant(userClient: SupabaseClient, serviceClient: SupabaseClient, requesterId: string, tenantId: string): Promise<boolean> {
  const rpcManage = await userClient.rpc("nexus_email_can_manage_tenant", { p_tenant_id: tenantId });
  if (!rpcManage.error) {
    return Boolean(rpcManage.data);
  }

  const rpcSuper = await userClient.rpc("nexus_is_master_admin_compat");
  if (!rpcSuper.error && rpcSuper.data) {
    return true;
  }

  const membershipRes = await serviceClient
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", requesterId)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (!membershipRes.error && membershipRes.data?.role) {
    const role = normalizeString(membershipRes.data.role).toLowerCase();
    if (["admin", "owner", "super_admin"].includes(role)) return true;
  }

  const legacyRes = await serviceClient
    .from("tenant_members")
    .select("role")
    .eq("user_id", requesterId)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (!legacyRes.error && (legacyRes.data as Record<string, unknown> | null)?.role) {
    const role = normalizeString((legacyRes.data as Record<string, unknown>).role).toLowerCase();
    if (["admin", "owner", "super_admin"].includes(role)) return true;
  }

  return false;
}

async function loadRouting(serviceClient: SupabaseClient, tenantId: string, messageType: MessageType): Promise<RoutingRuleRow> {
  const fallback = DEFAULT_ROUTING[messageType];

  const ruleRes = await serviceClient
    .from("esp_routing_rules")
    .select("message_type,primary_provider,fallback_provider,throttle_per_min")
    .eq("tenant_id", tenantId)
    .eq("message_type", messageType)
    .limit(1)
    .maybeSingle();

  if (ruleRes.error || !ruleRes.data) {
    return {
      message_type: messageType,
      primary_provider: fallback.primary,
      fallback_provider: fallback.fallback,
      throttle_per_min: fallback.throttle,
    };
  }

  const row = ruleRes.data as RoutingRuleRow;
  return {
    message_type: messageType,
    primary_provider: row.primary_provider || fallback.primary,
    fallback_provider: row.fallback_provider || fallback.fallback,
    throttle_per_min: Number(row.throttle_per_min || fallback.throttle),
  };
}

async function loadEnabledProviders(serviceClient: SupabaseClient, tenantId: string): Promise<ProviderConfigRow[]> {
  const providersRes = await serviceClient
    .from("esp_providers")
    .select("provider,is_enabled,priority,capabilities,config")
    .eq("tenant_id", tenantId)
    .eq("is_enabled", true)
    .order("priority", { ascending: true });

  if (providersRes.error || !providersRes.data || providersRes.data.length === 0) {
    return [
      {
        provider: "brevo",
        is_enabled: true,
        priority: 10,
        capabilities: { transactional: true, marketing: true },
        config: {},
      },
    ];
  }

  return (providersRes.data as ProviderConfigRow[])
    .filter((row) => row.provider === "brevo" || row.provider === "mailerlite");
}

async function enforceThrottleBestEffort(
  serviceClient: SupabaseClient,
  tenantId: string,
  provider: Provider,
  throttlePerMin: number,
): Promise<{ allowed: boolean; warning?: string; blockedReason?: string }> {
  const windowStart = minuteWindowStartISO();

  const counterRes = await serviceClient
    .from("esp_send_counters")
    .select("id,request_count")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .eq("window_start", windowStart)
    .limit(1)
    .maybeSingle();

  if (counterRes.error) {
    return {
      allowed: true,
      warning: `Throttle counter read failed (${counterRes.error.message}). Continuing with best-effort send.`,
    };
  }

  if (!counterRes.data) {
    const insertRes = await serviceClient.from("esp_send_counters").insert({
      tenant_id: tenantId,
      provider,
      window_start: windowStart,
      request_count: 1,
    });

    if (insertRes.error) {
      return {
        allowed: true,
        warning: `Throttle counter insert failed (${insertRes.error.message}). Continuing with best-effort send.`,
      };
    }

    return { allowed: true };
  }

  const currentCount = Number(counterRes.data.request_count || 0);
  if (currentCount >= throttlePerMin) {
    return {
      allowed: false,
      blockedReason: `Throttle exceeded for ${provider}. Try again in the next minute.`,
    };
  }

  const updateRes = await serviceClient
    .from("esp_send_counters")
    .update({ request_count: currentCount + 1 })
    .eq("id", counterRes.data.id);

  if (updateRes.error) {
    return {
      allowed: true,
      warning: `Throttle counter update failed (${updateRes.error.message}). Continuing with best-effort send.`,
    };
  }

  return { allowed: true };
}

async function syncMailerLiteSubscriber(
  apiKey: string,
  email: string,
  fullName: string | null,
  unsubscribed: boolean,
): Promise<unknown> {
  const response = await fetch("https://connect.mailerlite.com/api/subscribers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      email,
      status: unsubscribed ? "unsubscribed" : "active",
      fields: {
        name: fullName || "",
      },
    }),
  });

  const text = await response.text();
  let raw: unknown = null;
  if (text) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(errorMessageFromProviderResponse(response.status, raw, "MailerLite subscriber sync failed"));
  }

  return raw;
}

async function sendViaBrevo(params: {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
  messageType: MessageType;
  templateKey: string | null;
  tenantId: string;
}): Promise<SendAttemptResult> {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "api-key": params.apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: params.fromName,
        email: params.fromEmail,
      },
      to: [
        {
          email: params.toEmail,
          name: params.toName,
        },
      ],
      subject: params.subject,
      htmlContent: params.html,
      textContent: params.text || undefined,
      headers: {
        "X-Nexus-Message-Type": params.messageType,
        "X-Nexus-Template-Key": params.templateKey || "",
        "X-Nexus-Tenant": params.tenantId,
      },
    }),
  });

  const responseText = await response.text();
  let raw: unknown = null;
  if (responseText) {
    try {
      raw = JSON.parse(responseText);
    } catch {
      raw = { raw: responseText };
    }
  }

  const responseRequestId = normalizeString(response.headers.get("x-request-id"));
  const providerMessageId = extractProviderMessageId(raw) || responseRequestId || null;

  if (!response.ok) {
    return {
      ok: false,
      providerMessageId,
      raw,
      error: errorMessageFromProviderResponse(response.status, raw, "Brevo send failed"),
      transport: "brevo",
    };
  }

  return {
    ok: true,
    providerMessageId,
    raw,
    error: null,
    transport: "brevo",
  };
}

async function sendViaResend(params: {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
  messageType: MessageType;
  templateKey: string | null;
  tenantId: string;
}): Promise<SendAttemptResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      from: `${params.fromName} <${params.fromEmail}>`,
      to: [params.toEmail],
      subject: params.subject,
      html: params.html,
      text: params.text || undefined,
      headers: {
        "X-Nexus-Message-Type": params.messageType,
        "X-Nexus-Template-Key": params.templateKey || "",
        "X-Nexus-Tenant": params.tenantId,
      },
      tags: [
        { name: "message_type", value: params.messageType },
      ],
    }),
  });

  const responseText = await response.text();
  let raw: unknown = null;
  if (responseText) {
    try {
      raw = JSON.parse(responseText);
    } catch {
      raw = { raw: responseText };
    }
  }

  const responseRequestId = normalizeString(response.headers.get("x-request-id"));
  const providerMessageId = extractProviderMessageId(raw) || responseRequestId || null;

  if (!response.ok) {
    return {
      ok: false,
      providerMessageId,
      raw,
      error: errorMessageFromProviderResponse(response.status, raw, "Resend send failed"),
      transport: "resend",
    };
  }

  return {
    ok: true,
    providerMessageId,
    raw,
    error: null,
    transport: "resend",
  };
}
async function sendViaMailerLite(params: {
  apiKey: string;
  toEmail: string;
  toName: string;
  unsubscribed: boolean;
  messageType: MessageType;
}): Promise<SendAttemptResult> {
  try {
    const syncRaw = await syncMailerLiteSubscriber(params.apiKey, params.toEmail, params.toName, params.unsubscribed);
    return {
      ok: false,
      providerMessageId: extractProviderMessageId(syncRaw),
      raw: syncRaw,
      error: "MailerLite direct send is unsupported for this workflow. Subscriber sync completed.",
      unsupported: true,
      transport: "mailerlite",
    };
  } catch (error) {
    return {
      ok: false,
      providerMessageId: null,
      raw: null,
      error: error instanceof Error ? error.message : "MailerLite subscriber sync failed.",
      unsupported: true,
      transport: "mailerlite",
    };
  }
}

async function upsertEspContact(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  userId: string | null;
  email: string;
  fullName: string | null;
  consentMarketing: boolean;
}): Promise<ContactRow> {
  const existingRes = await params.serviceClient
    .from("esp_contacts")
    .select("id,user_id,consent_transactional,consent_marketing,unsubscribed,tags,provider_refs")
    .eq("tenant_id", params.tenantId)
    .eq("email", params.email)
    .limit(1)
    .maybeSingle();

  const existing = (existingRes.data || null) as ContactRow | null;

  const nextConsentMarketing = params.userId
    ? Boolean(params.consentMarketing)
    : existing
      ? Boolean(existing.consent_marketing)
      : Boolean(params.consentMarketing);

  const payload = {
    tenant_id: params.tenantId,
    user_id: params.userId || existing?.user_id || null,
    email: params.email,
    full_name: params.fullName,
    consent_transactional: existing ? Boolean(existing.consent_transactional) : true,
    consent_marketing: nextConsentMarketing,
    unsubscribed: existing ? Boolean(existing.unsubscribed) : false,
    tags: existing?.tags || [],
    provider_refs: existing?.provider_refs || {},
  };

  const upsertRes = await params.serviceClient
    .from("esp_contacts")
    .upsert(payload, { onConflict: "tenant_id,email" })
    .select("id,user_id,consent_transactional,consent_marketing,unsubscribed,tags,provider_refs")
    .single();

  if (upsertRes.error || !upsertRes.data) {
    throw new Error(upsertRes.error?.message || "Unable to upsert email contact.");
  }

  return upsertRes.data as ContactRow;
}

async function updateContactProviderRef(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  email: string;
  provider: Provider;
  providerMessageId: string | null;
}) {
  if (!params.providerMessageId) return;

  const contactRes = await params.serviceClient
    .from("esp_contacts")
    .select("provider_refs")
    .eq("tenant_id", params.tenantId)
    .eq("email", params.email)
    .limit(1)
    .maybeSingle();

  if (contactRes.error || !contactRes.data) return;

  const providerRefs = {
    ...(contactRes.data.provider_refs || {}),
    [params.provider]: {
      last_message_id: params.providerMessageId,
      updated_at: new Date().toISOString(),
    },
  };

  await params.serviceClient
    .from("esp_contacts")
    .update({ provider_refs: providerRefs })
    .eq("tenant_id", params.tenantId)
    .eq("email", params.email);
}

async function insertMessageAttempt(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  userId: string | null;
  toEmail: string;
  messageType: MessageType;
  subject: string;
  templateKey: string | null;
  provider: Provider;
  providerMessageId: string | null;
  status: string;
  error: string | null;
  meta: Record<string, unknown>;
}): Promise<string | null> {
  const insertRes = await params.serviceClient
    .from("esp_messages")
    .insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      to_email: params.toEmail,
      message_type: params.messageType,
      subject: params.subject,
      template_key: params.templateKey,
      provider: params.provider,
      provider_message_id: params.providerMessageId,
      status: params.status,
      error: params.error,
      meta: params.meta,
    })
    .select("id")
    .single();

  if (insertRes.error || !insertRes.data?.id) {
    return null;
  }

  return String(insertRes.data.id);
}

function resolveProviderChain(params: {
  messageType: MessageType;
  routing: RoutingRuleRow;
  enabledProviders: ProviderConfigRow[];
}): Provider[] {
  const enabled = params.enabledProviders
    .map((row) => row.provider)
    .filter((provider): provider is Provider => provider === "brevo" || provider === "mailerlite");

  const enabledSet = new Set<Provider>(enabled);
  const defaultRoute = DEFAULT_ROUTING[params.messageType];

  let primary = params.routing.primary_provider || defaultRoute.primary;
  if (!enabledSet.has(primary)) {
    if (isMarketingType(params.messageType) && enabledSet.has("mailerlite")) {
      primary = "mailerlite";
    } else if (enabledSet.has("brevo")) {
      primary = "brevo";
    } else if (enabled.length > 0) {
      primary = enabled[0];
    }
  }

  const requestedFallback = params.routing.fallback_provider || defaultRoute.fallback;
  let fallback: Provider | null = requestedFallback && enabledSet.has(requestedFallback)
    ? requestedFallback
    : null;

  if (!fallback && primary === "mailerlite" && enabledSet.has("brevo")) {
    fallback = "brevo";
  }

  if (fallback === primary) {
    fallback = null;
  }

  return dedupeProviders([primary, fallback]);
}

async function handleSend(req: Request): Promise<Response> {
  const supabaseUrl = normalizeString(Deno.env.get("SUPABASE_URL"));
  const supabaseAnonKey = normalizeString(Deno.env.get("SUPABASE_ANON_KEY"));
  const serviceRoleKey = normalizeString(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(500, { success: false, error: "Supabase environment not configured." });
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return json(400, { success: false, error: "Invalid JSON body." });
  }

  const messageType = normalizeMessageType(body.message_type);
  const toEmail = normalizeEmail(body.to);
  const subject = normalizeString(body.subject);
  const html = typeof body.html === "string" ? body.html : "";
  const text = typeof body.text === "string" ? body.text : "";

  if (!messageType) {
    return json(400, { success: false, error: "Invalid message_type." });
  }

  if (!toEmail || !subject || (!html && !text)) {
    return json(400, { success: false, error: "Missing required fields: message_type, to, subject, html or text." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { success: false, error: "Missing bearer token." });
  }

  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = isServiceRoleBearerToken(bearerToken, serviceRoleKey);

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  let requester: { id: string; user_metadata?: Record<string, unknown> } | null = null;
  if (!isServiceRole) {
    const authRes = await userClient.auth.getUser();
    if (authRes.error || !authRes.data.user?.id) {
      return json(401, { success: false, error: "Unauthorized." });
    }
    requester = {
      id: authRes.data.user.id,
      user_metadata: authRes.data.user.user_metadata as Record<string, unknown> | undefined,
    };
  }

  const requesterId = requester?.id || null;
  const requestedUserId = normalizeString(body.user_id) || null;
  const actingUserId = requestedUserId || requesterId;

  const tenantId = await resolveTenantId(
    serviceClient,
    actingUserId,
    normalizeString(body.tenant_id) || null,
  );

  if (!tenantId) {
    return json(400, { success: false, error: "Unable to resolve tenant_id." });
  }

  if (!isServiceRole && requestedUserId && requesterId && requestedUserId !== requesterId) {
    const canManage = await canRequesterManageTenant(userClient, serviceClient, requesterId, tenantId);
    if (!canManage) {
      return json(403, { success: false, error: "Cannot send on behalf of another user." });
    }
  }

  const communicationPrefRes = actingUserId
    ? await serviceClient
      .from("communication_preferences")
      .select("marketing_email_opt_in")
      .eq("user_id", actingUserId)
      .limit(1)
      .maybeSingle()
    : { data: null, error: null };

  const consentStatusRes = actingUserId
    ? await serviceClient
      .from("user_consent_status")
      .select("comms_email_accepted")
      .eq("user_id", actingUserId)
      .limit(1)
      .maybeSingle()
    : { data: null, error: null };

  const consentMarketing = actingUserId
    ? Boolean(communicationPrefRes.data?.marketing_email_opt_in)
    : normalizeBoolean(body.consent_marketing);

  const commsEmailAccepted = actingUserId
    ? Boolean(consentStatusRes.data?.comms_email_accepted)
    : normalizeBoolean(body.comms_email_accepted);

  const contact = await upsertEspContact({
    serviceClient,
    tenantId,
    userId: actingUserId || null,
    email: toEmail,
    fullName: normalizeString(body.to_name) || normalizeString(requester?.user_metadata?.name) || null,
    consentMarketing,
  });

  const templateKey = normalizeString(body.template_key) || null;

  if (contact.unsubscribed) {
    const blockedMessageId = await insertMessageAttempt({
      serviceClient,
      tenantId,
      userId: actingUserId || null,
      toEmail,
      messageType,
      subject,
      templateKey,
      provider: "brevo",
      providerMessageId: null,
      status: "blocked",
      error: "Recipient is unsubscribed.",
      meta: { blocked_reason: "unsubscribed" },
    });

    return json(403, {
      success: false,
      message_id: blockedMessageId,
      status: "blocked",
      error: "Recipient is unsubscribed.",
    });
  }

  if (isMarketingType(messageType)) {
    if (!contact.consent_marketing || !commsEmailAccepted) {
      const blockedMessageId = await insertMessageAttempt({
        serviceClient,
        tenantId,
        userId: actingUserId || null,
        toEmail,
        messageType,
        subject,
        templateKey,
        provider: "mailerlite",
        providerMessageId: null,
        status: "blocked",
        error: "Marketing email requires consent_marketing and comms_email policy acceptance.",
        meta: { blocked_reason: "consent_marketing_or_policy_missing" },
      });

      return json(403, {
        success: false,
        message_id: blockedMessageId,
        status: "blocked",
        error: "Marketing email requires consent_marketing and comms_email policy acceptance.",
      });
    }
  } else if (!contact.consent_transactional) {
    const blockedMessageId = await insertMessageAttempt({
      serviceClient,
      tenantId,
      userId: actingUserId || null,
      toEmail,
      messageType,
      subject,
      templateKey,
      provider: "brevo",
      providerMessageId: null,
      status: "blocked",
      error: "Transactional consent not available for recipient.",
      meta: { blocked_reason: "consent_transactional_missing" },
    });

    return json(403, {
      success: false,
      message_id: blockedMessageId,
      status: "blocked",
      error: "Transactional consent not available for recipient.",
    });
  }

  const routing = await loadRouting(serviceClient, tenantId, messageType);
  const enabledProviders = await loadEnabledProviders(serviceClient, tenantId);
  const providerChain = resolveProviderChain({ messageType, routing, enabledProviders });

  if (providerChain.length === 0) {
    return json(503, {
      success: false,
      status: "failed",
      error: "No enabled email providers are configured for this tenant.",
    });
  }

  const brevoApiKey = normalizeString(Deno.env.get("BREVO_API_KEY"));
  const resendApiKey = normalizeString(Deno.env.get("RESEND_API_KEY"));
  const transactionalProviderPreference = normalizeString(Deno.env.get("EMAIL_TRANSACTIONAL_PROVIDER")).toLowerCase();
  const mailerLiteApiKey = normalizeString(Deno.env.get("MAILERLITE_API_KEY"));
  const defaultFromEmail = normalizeString(Deno.env.get("DEFAULT_FROM_EMAIL"));
  const defaultFromName = normalizeString(Deno.env.get("DEFAULT_FROM_NAME")) || "Nexus";

  if (!defaultFromEmail) {
    return json(500, { success: false, error: "DEFAULT_FROM_EMAIL is missing." });
  }

  const withFooter = addEducationalFooter(html, text);
  const throttlePerMin = Math.max(1, Number(routing.throttle_per_min || DEFAULT_ROUTING[messageType].throttle));

  for (const provider of providerChain) {
    const throttleResult = await enforceThrottleBestEffort(serviceClient, tenantId, provider, throttlePerMin);
    if (!throttleResult.allowed) {
      await insertMessageAttempt({
        serviceClient,
        tenantId,
        userId: actingUserId || null,
        toEmail,
        messageType,
        subject,
        templateKey,
        provider,
        providerMessageId: null,
        status: "failed",
        error: throttleResult.blockedReason || "Throttle blocked send.",
        meta: { stage: "throttle" },
      });
      continue;
    }

    let attempt: SendAttemptResult;

    if (provider === "brevo") {
      const prefersResend = transactionalProviderPreference === "resend" || transactionalProviderPreference === "" || transactionalProviderPreference === "auto";
      const prefersBrevo = transactionalProviderPreference === "brevo";

      if (prefersResend && resendApiKey) {
        attempt = await sendViaResend({
          apiKey: resendApiKey,
          fromEmail: defaultFromEmail,
          fromName: defaultFromName,
          toEmail,
          toName: normalizeString(body.to_name) || "Recipient",
          subject,
          html: withFooter.html,
          text: withFooter.text,
          messageType,
          templateKey,
          tenantId,
        });
      } else if ((prefersBrevo || !resendApiKey) && brevoApiKey) {
        attempt = await sendViaBrevo({
          apiKey: brevoApiKey,
          fromEmail: defaultFromEmail,
          fromName: defaultFromName,
          toEmail,
          toName: normalizeString(body.to_name) || "Recipient",
          subject,
          html: withFooter.html,
          text: withFooter.text,
          messageType,
          templateKey,
          tenantId,
        });
      } else if (resendApiKey) {
        attempt = await sendViaResend({
          apiKey: resendApiKey,
          fromEmail: defaultFromEmail,
          fromName: defaultFromName,
          toEmail,
          toName: normalizeString(body.to_name) || "Recipient",
          subject,
          html: withFooter.html,
          text: withFooter.text,
          messageType,
          templateKey,
          tenantId,
        });
      } else {
        attempt = {
          ok: false,
          providerMessageId: null,
          raw: null,
          error: "No transactional provider key configured (set RESEND_API_KEY or BREVO_API_KEY).",
        };
      }
    } else {
      if (!mailerLiteApiKey) {
        attempt = {
          ok: false,
          providerMessageId: null,
          raw: null,
          error: "MAILERLITE_API_KEY is missing.",
          unsupported: true,
        };
      } else {
        attempt = await sendViaMailerLite({
          apiKey: mailerLiteApiKey,
          toEmail,
          toName: normalizeString(body.to_name) || "Recipient",
          unsubscribed: contact.unsubscribed,
          messageType,
        });
      }
    }

    const status = attempt.ok
      ? "sent"
      : attempt.unsupported
        ? "unsupported_send"
        : "failed";

    const messageId = await insertMessageAttempt({
      serviceClient,
      tenantId,
      userId: actingUserId || null,
      toEmail,
      messageType,
      subject,
      templateKey,
      provider,
      providerMessageId: attempt.providerMessageId,
      status,
      error: attempt.error,
      meta: {
        payload_data: (body.data && typeof body.data === "object") ? body.data : {},
        response: attempt.raw,
        transport: attempt.transport || provider,
        throttle_warning: throttleResult.warning || null,
      },
    });

    if (attempt.ok) {
      await updateContactProviderRef({
        serviceClient,
        tenantId,
        email: toEmail,
        provider,
        providerMessageId: attempt.providerMessageId,
      });

      return json(200, {
        success: true,
        message_id: messageId,
        provider,
        transport: attempt.transport || provider,
        status: "sent",
      });
    }

    if (attempt.unsupported && providerChain[providerChain.length - 1] === provider) {
      return json(422, {
        success: false,
        message_id: messageId,
        provider,
        transport: attempt.transport || provider,
        status: "unsupported_send",
        error: attempt.error || "Provider does not support direct send for this message type.",
      });
    }
  }

  return json(502, {
    success: false,
    status: "failed",
    error: "All configured providers failed for this send request.",
  });
}

async function processSingleWebhookEvent(params: {
  serviceClient: SupabaseClient;
  provider: Provider;
  payload: Record<string, unknown>;
  verified: boolean;
  unverified: boolean;
}): Promise<void> {
  const { serviceClient, provider, payload, verified, unverified } = params;

  const eventType = inferWebhookEventType(payload);
  const providerMessageId = extractProviderMessageId(payload);
  const email = inferWebhookEmail(payload);
  const mappedStatus = mapWebhookStatus(eventType);

  let tenantId = normalizeString(payload.tenant_id) || null;
  let messageRow: { id: string; tenant_id: string; user_id: string | null; to_email: string } | null = null;

  if (providerMessageId) {
    const messageRes = await serviceClient
      .from("esp_messages")
      .select("id,tenant_id,user_id,to_email")
      .eq("provider", provider)
      .eq("provider_message_id", providerMessageId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!messageRes.error && messageRes.data) {
      messageRow = messageRes.data as { id: string; tenant_id: string; user_id: string | null; to_email: string };
      tenantId = tenantId || messageRow.tenant_id;
    }
  }

  await serviceClient
    .from("esp_webhook_events")
    .insert({
      tenant_id: tenantId,
      provider,
      provider_message_id: providerMessageId,
      event_type: eventType,
      payload: {
        ...payload,
        webhook_verified: verified,
        webhook_unverified: unverified,
      },
    });

  if (mappedStatus && providerMessageId) {
    await serviceClient
      .from("esp_messages")
      .update({ status: mappedStatus })
      .eq("provider", provider)
      .eq("provider_message_id", providerMessageId);
  }

  if (mappedStatus === "unsubscribed" && tenantId) {
    const targetEmail = (email || messageRow?.to_email || "").toLowerCase();
    if (targetEmail) {
      await serviceClient
        .from("esp_contacts")
        .update({
          unsubscribed: true,
          consent_marketing: false,
          consent_transactional: false,
        })
        .eq("tenant_id", tenantId)
        .eq("email", targetEmail);
    }

    if (messageRow?.user_id) {
      await serviceClient
        .from("consents")
        .insert({
          user_id: messageRow.user_id,
          tenant_id: tenantId,
          consent_type: "comms_email",
          version: "opt_out_v1",
          accepted_at: new Date().toISOString(),
          metadata: {
            source: "email_webhook",
            provider,
            event_type: eventType,
            webhook_verified: verified,
          },
        });
    }
  }
}

async function handleWebhook(req: Request, provider: Provider): Promise<Response> {
  const supabaseUrl = normalizeString(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeString(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { success: false, error: "Supabase environment not configured." });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const rawBody = await req.text();
  let parsedBody: unknown;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json(400, { success: false, error: "Invalid webhook JSON body." });
  }

  const providerUpper = provider.toUpperCase();
  const expectedSecret = normalizeString(Deno.env.get(`EMAIL_WEBHOOK_SECRET_${providerUpper}`));

  const signature = normalizeString(
    req.headers.get("x-signature")
      || req.headers.get("x-webhook-signature")
      || req.headers.get("x-brevo-signature")
      || req.headers.get("x-mailerlite-signature")
      || "",
  );

  const verified = Boolean(expectedSecret && signature && expectedSecret === signature);
  const unverified = expectedSecret ? !verified : true;

  const events = Array.isArray(parsedBody)
    ? parsedBody.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : (parsedBody && typeof parsedBody === "object")
      ? [parsedBody as Record<string, unknown>]
      : [];

  if (events.length === 0) {
    return json(400, { success: false, error: "Webhook payload must be an object or array of objects." });
  }

  for (const eventPayload of events) {
    await processSingleWebhookEvent({
      serviceClient,
      provider,
      payload: eventPayload,
      verified,
      unverified,
    });
  }

  return json(200, {
    success: true,
    provider,
    webhook_verified: verified,
    webhook_unverified: unverified,
    processed: events.length,
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method not allowed." });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/+$/, "");

    if (pathname === "" || pathname === "/" || pathname.endsWith("/send") || pathname.endsWith("/email-orchestrator")) {
      return await handleSend(req);
    }

    if (pathname.endsWith("/webhook/brevo")) {
      return await handleWebhook(req, "brevo");
    }

    if (pathname.endsWith("/webhook/mailerlite")) {
      return await handleWebhook(req, "mailerlite");
    }

    return json(404, { success: false, error: "Not found." });
  } catch (error) {
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    });
  }
});
