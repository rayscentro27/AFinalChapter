import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type Provider = "sender" | "brevo" | "mailerlite";
type MessageType =
  | "transactional"
  | "billing"
  | "system"
  | "onboarding"
  | "reminders"
  | "marketing"
  | "newsletter";

type SendBody = {
  tenant_id?: string;
  message_type?: MessageType;
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
  template_key?: string;
  data?: Record<string, unknown>;
  user_id?: string;
  to_name?: string;
};

type SendAttemptResult = {
  ok: boolean;
  providerMessageId: string | null;
  raw: unknown;
  error: string | null;
  unsupported?: boolean;
};

type ProviderConfigRow = {
  provider: Provider;
  is_enabled: boolean;
  priority: number;
  capabilities: Record<string, unknown>;
  config: Record<string, unknown>;
};

type RoutingRuleRow = {
  message_type: MessageType;
  primary_provider: Provider;
  fallback_provider: Provider | null;
  throttle_per_min: number;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-webhook-signature, x-sender-signature",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
  transactional: { primary: "sender", fallback: "brevo", throttle: 60 },
  billing: { primary: "sender", fallback: "brevo", throttle: 60 },
  system: { primary: "sender", fallback: "brevo", throttle: 60 },
  onboarding: { primary: "sender", fallback: "brevo", throttle: 60 },
  reminders: { primary: "sender", fallback: "brevo", throttle: 60 },
  marketing: { primary: "mailerlite", fallback: "sender", throttle: 30 },
  newsletter: { primary: "mailerlite", fallback: "sender", throttle: 30 },
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
    if (!output.includes(value)) {
      output.push(value);
    }
  }
  return output;
}

function extractProviderMessageId(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;

  const direct = obj.id ?? obj.message_id ?? obj.messageId ?? obj["message-id"];
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

function mapWebhookStatus(eventTypeRaw: string): string | null {
  const eventType = eventTypeRaw.toLowerCase();
  if (!eventType) return null;
  if (eventType.includes("deliver") || eventType.includes("sent") || eventType.includes("processed")) return "delivered";
  if (eventType.includes("open")) return "opened";
  if (eventType.includes("click")) return "clicked";
  if (eventType.includes("bounce")) return "bounced";
  if (eventType.includes("complain") || eventType.includes("spam")) return "complained";
  if (eventType.includes("unsubscribe") || eventType.includes("unsub")) return "unsubscribed";
  if (eventType.includes("fail") || eventType.includes("reject") || eventType.includes("error")) return "failed";
  return null;
}

function inferWebhookEventType(payload: Record<string, unknown>): string {
  const candidates = [
    payload.event,
    payload.event_type,
    payload.type,
    payload.status,
    payload.action,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "unknown";
}

function inferWebhookEmail(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.email,
    payload.to,
    payload.recipient,
    payload["email_to"],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().toLowerCase();
    }
  }

  if (Array.isArray(payload.to) && payload.to.length > 0 && typeof payload.to[0] === "string") {
    return String(payload.to[0]).trim().toLowerCase();
  }

  return null;
}

function addEducationalFooter(html: string, text: string): { html: string; text: string } {
  const footerLine = "Educational only. No guarantees of outcomes.";

  const htmlFooter = `<hr style="margin-top:24px;border:none;border-top:1px solid #e2e8f0"/><p style="font-size:12px;color:#64748b">${footerLine}</p>`;
  const nextHtml = html
    ? `${html}${htmlFooter}`
    : `<p>${footerLine}</p>`;

  const nextText = text
    ? `${text}\n\n${footerLine}`
    : footerLine;

  return { html: nextHtml, text: nextText };
}

function errorMessageFromProviderResponse(status: number, raw: unknown, fallback: string): string {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const message = obj.message ?? obj.error ?? obj.details;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return `${fallback} (${status})`;
}

async function resolveTenantId(serviceClient: SupabaseClient, preferredUserId: string | null, bodyTenantId: string | null): Promise<string | null> {
  if (bodyTenantId) {
    return bodyTenantId;
  }

  const userId = preferredUserId || null;
  if (userId) {
    const memberRes = await serviceClient
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!memberRes.error && memberRes.data?.tenant_id) {
      return String(memberRes.data.tenant_id);
    }

    const fallbackRes = await serviceClient
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!fallbackRes.error && (fallbackRes.data as Record<string, unknown> | null)?.tenant_id) {
      return String((fallbackRes.data as Record<string, unknown>).tenant_id);
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

async function loadRouting(serviceClient: SupabaseClient, tenantId: string, messageType: MessageType): Promise<RoutingRuleRow> {
  const defaultRule = DEFAULT_ROUTING[messageType];

  const { data, error } = await serviceClient
    .from("esp_routing_rules")
    .select("message_type,primary_provider,fallback_provider,throttle_per_min")
    .eq("tenant_id", tenantId)
    .eq("message_type", messageType)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      message_type: messageType,
      primary_provider: defaultRule.primary,
      fallback_provider: defaultRule.fallback,
      throttle_per_min: defaultRule.throttle,
    };
  }

  return data as RoutingRuleRow;
}

async function loadEnabledProviders(serviceClient: SupabaseClient, tenantId: string): Promise<ProviderConfigRow[]> {
  const { data, error } = await serviceClient
    .from("esp_providers")
    .select("provider,is_enabled,priority,capabilities,config")
    .eq("tenant_id", tenantId)
    .eq("is_enabled", true)
    .order("priority", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data as ProviderConfigRow[];
}

async function enforceThrottle(
  serviceClient: SupabaseClient,
  tenantId: string,
  provider: Provider,
  throttlePerMin: number,
): Promise<{ ok: boolean; error?: string }> {
  const windowStart = minuteWindowStartISO();

  const { data: existing, error: readError } = await serviceClient
    .from("esp_send_counters")
    .select("id,request_count")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .eq("window_start", windowStart)
    .limit(1)
    .maybeSingle();

  if (readError) {
    return { ok: false, error: `Throttle lookup failed: ${readError.message}` };
  }

  if (!existing) {
    const { error: insertError } = await serviceClient
      .from("esp_send_counters")
      .insert({
        tenant_id: tenantId,
        provider,
        window_start: windowStart,
        request_count: 1,
      });

    if (insertError) {
      return { ok: false, error: `Throttle counter insert failed: ${insertError.message}` };
    }

    return { ok: true };
  }

  const requestCount = Number(existing.request_count || 0);
  if (requestCount >= throttlePerMin) {
    return { ok: false, error: `Throttle exceeded for provider ${provider}. Try again in the next minute.` };
  }

  const { error: updateError } = await serviceClient
    .from("esp_send_counters")
    .update({ request_count: requestCount + 1 })
    .eq("id", existing.id);

  if (updateError) {
    return { ok: false, error: `Throttle counter update failed: ${updateError.message}` };
  }

  return { ok: true };
}

async function syncMailerLiteSubscriber(
  apiKey: string,
  email: string,
  fullName: string | null,
  unsubscribed: boolean,
): Promise<void> {
  const body = {
    email,
    status: unsubscribed ? "unsubscribed" : "active",
    fields: {
      name: fullName || "",
    },
  };

  await fetch("https://connect.mailerlite.com/api/subscribers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function sendViaSender(params: {
  token: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName: string;
  subject: string;
  html: string;
}): Promise<SendAttemptResult> {
  const response = await fetch("https://api.sender.net/v2/message/send", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      from: {
        email: params.fromEmail,
        name: params.fromName,
      },
      to: {
        email: params.toEmail,
        name: params.toName,
      },
      subject: params.subject,
      html: params.html,
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
    return {
      ok: false,
      providerMessageId: extractProviderMessageId(raw),
      raw,
      error: errorMessageFromProviderResponse(response.status, raw, "Sender send failed"),
    };
  }

  return {
    ok: true,
    providerMessageId: extractProviderMessageId(raw),
    raw,
    error: null,
  };
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
      textContent: params.text,
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
    return {
      ok: false,
      providerMessageId: extractProviderMessageId(raw),
      raw,
      error: errorMessageFromProviderResponse(response.status, raw, "Brevo send failed"),
    };
  }

  return {
    ok: true,
    providerMessageId: extractProviderMessageId(raw),
    raw,
    error: null,
  };
}

async function sendViaMailerLite(params: {
  apiKey: string;
  toEmail: string;
  toName: string;
  messageType: MessageType;
  unsubscribed: boolean;
}): Promise<SendAttemptResult> {
  try {
    await syncMailerLiteSubscriber(params.apiKey, params.toEmail, params.toName, params.unsubscribed);
  } catch {
    // Subscriber sync failures should not crash orchestration.
  }

  return {
    ok: false,
    providerMessageId: null,
    raw: { provider: "mailerlite", reason: "unsupported_send" },
    error: "MailerLite direct send is not configured. Subscriber sync completed; configure campaign automation or fallback provider.",
    unsupported: true,
  };
}

async function upsertEspContact(params: {
  serviceClient: SupabaseClient;
  tenantId: string;
  userId: string | null;
  email: string;
  fullName: string | null;
  consentMarketing: boolean;
}): Promise<{
  id: string;
  user_id: string | null;
  consent_transactional: boolean;
  consent_marketing: boolean;
  unsubscribed: boolean;
}> {
  const { data: existing } = await params.serviceClient
    .from("esp_contacts")
    .select("id,user_id,consent_transactional,consent_marketing,unsubscribed")
    .eq("tenant_id", params.tenantId)
    .eq("email", params.email)
    .limit(1)
    .maybeSingle();

  const transactional = existing ? Boolean(existing.consent_transactional) : true;
  const marketing = existing
    ? Boolean(existing.consent_marketing || params.consentMarketing)
    : Boolean(params.consentMarketing);
  const unsubscribed = existing ? Boolean(existing.unsubscribed) : false;

  const payload = {
    tenant_id: params.tenantId,
    user_id: params.userId || existing?.user_id || null,
    email: params.email,
    full_name: params.fullName,
    consent_transactional: transactional,
    consent_marketing: marketing,
    unsubscribed,
  };

  const { data, error } = await params.serviceClient
    .from("esp_contacts")
    .upsert(payload, { onConflict: "tenant_id,email" })
    .select("id,user_id,consent_transactional,consent_marketing,unsubscribed")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to upsert email contact.");
  }

  return data as {
    id: string;
    user_id: string | null;
    consent_transactional: boolean;
    consent_marketing: boolean;
    unsubscribed: boolean;
  };
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
  const { data, error } = await params.serviceClient
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

  if (error) {
    return null;
  }

  return String(data.id);
}

async function handleSend(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return json(500, { success: false, error: "Supabase environment not configured." });
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return json(400, { success: false, error: "Invalid JSON body." });
  }

  const messageType = body.message_type;
  const toEmail = normalizeEmail(body.to);
  const subject = normalizeString(body.subject);
  const html = typeof body.html === "string" ? body.html : "";
  const text = typeof body.text === "string" ? body.text : "";

  if (!messageType || !ALLOWED_MESSAGE_TYPES.includes(messageType)) {
    return json(400, { success: false, error: "Invalid message_type." });
  }

  if (!toEmail || !subject || (!html && !text)) {
    return json(400, { success: false, error: "Missing required fields: message_type, to, subject, html or text." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { success: false, error: "Missing bearer token." });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const authRes = await userClient.auth.getUser();
  if (authRes.error || !authRes.data.user) {
    return json(401, { success: false, error: "Unauthorized." });
  }

  const requester = authRes.data.user;
  const requestedUserId = normalizeString(body.user_id);
  const actingUserId = requestedUserId || requester.id;

  if (requestedUserId && requestedUserId !== requester.id) {
    const membershipCheck = await serviceClient
      .from("tenant_memberships")
      .select("role")
      .eq("user_id", requester.id)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    if (membershipCheck.error || !membershipCheck.data) {
      return json(403, { success: false, error: "Cannot send on behalf of another user." });
    }
  }

  const tenantId = await resolveTenantId(serviceClient, actingUserId, normalizeString(body.tenant_id) || null);
  if (!tenantId) {
    return json(400, { success: false, error: "Unable to resolve tenant_id." });
  }

  const commPrefsRes = actingUserId
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

  const consentMarketing = Boolean(commPrefsRes.data?.marketing_email_opt_in);
  const commsEmailAccepted = Boolean(consentStatusRes.data?.comms_email_accepted);

  const contact = await upsertEspContact({
    serviceClient,
    tenantId,
    userId: actingUserId || null,
    email: toEmail,
    fullName: normalizeString(body.to_name) || normalizeString(requester.user_metadata?.name) || null,
    consentMarketing,
  });

  if (contact.unsubscribed) {
    await insertMessageAttempt({
      serviceClient,
      tenantId,
      userId: actingUserId,
      toEmail,
      messageType,
      subject,
      templateKey: normalizeString(body.template_key) || null,
      provider: "sender",
      providerMessageId: null,
      status: "blocked",
      error: "Recipient is unsubscribed.",
      meta: { blocked_reason: "unsubscribed" },
    });

    return json(403, { success: false, error: "Recipient is unsubscribed.", status: "blocked" });
  }

  if (isMarketingType(messageType)) {
    if (!contact.consent_marketing || !commsEmailAccepted) {
      await insertMessageAttempt({
        serviceClient,
        tenantId,
        userId: actingUserId,
        toEmail,
        messageType,
        subject,
        templateKey: normalizeString(body.template_key) || null,
        provider: "sender",
        providerMessageId: null,
        status: "blocked",
        error: "Marketing email requires consent_marketing and comms_email policy acceptance.",
        meta: { blocked_reason: "consent_marketing_or_policy_missing" },
      });

      return json(403, {
        success: false,
        error: "Marketing email requires consent_marketing and comms_email policy acceptance.",
        status: "blocked",
      });
    }
  } else if (!contact.consent_transactional) {
    await insertMessageAttempt({
      serviceClient,
      tenantId,
      userId: actingUserId,
      toEmail,
      messageType,
      subject,
      templateKey: normalizeString(body.template_key) || null,
      provider: "sender",
      providerMessageId: null,
      status: "blocked",
      error: "Transactional consent not available for recipient.",
      meta: { blocked_reason: "consent_transactional_missing" },
    });

    return json(403, {
      success: false,
      error: "Transactional consent not available for recipient.",
      status: "blocked",
    });
  }

  const routing = await loadRouting(serviceClient, tenantId, messageType);
  const enabledProviders = await loadEnabledProviders(serviceClient, tenantId);

  const enabledProviderKeys = enabledProviders.map((row) => row.provider);
  const defaultRouting = DEFAULT_ROUTING[messageType];

  let primaryProvider: Provider = routing.primary_provider || defaultRouting.primary;
  if (!enabledProviderKeys.includes(primaryProvider)) {
    primaryProvider = enabledProviderKeys[0] || defaultRouting.primary;
  }

  let fallbackProvider: Provider | null = routing.fallback_provider || defaultRouting.fallback;
  if (fallbackProvider && !enabledProviderKeys.includes(fallbackProvider)) {
    fallbackProvider = null;
  }

  const providerChain = dedupeProviders([primaryProvider, fallbackProvider]);
  if (providerChain.length === 0) {
    return json(503, { success: false, error: "No enabled ESP providers configured for tenant." });
  }

  const senderToken = normalizeString(Deno.env.get("SENDER_API_TOKEN") || Deno.env.get("SENDER_API_KEY"));
  const brevoApiKey = normalizeString(Deno.env.get("BREVO_API_KEY"));
  const mailerLiteApiKey = normalizeString(Deno.env.get("MAILERLITE_API_KEY"));

  const defaultFromEmail = normalizeString(Deno.env.get("SENDER_FROM_EMAIL_OVERRIDE") || Deno.env.get("DEFAULT_FROM_EMAIL"));
  const defaultFromName = normalizeString(Deno.env.get("DEFAULT_FROM_NAME") || "Nexus");

  if (!defaultFromEmail) {
    return json(500, { success: false, error: "DEFAULT_FROM_EMAIL is missing." });
  }

  const withFooter = addEducationalFooter(html, text);

  for (const provider of providerChain) {
    const throttleCheck = await enforceThrottle(
      serviceClient,
      tenantId,
      provider,
      Number(routing.throttle_per_min || DEFAULT_ROUTING[messageType].throttle),
    );

    if (!throttleCheck.ok) {
      await insertMessageAttempt({
        serviceClient,
        tenantId,
        userId: actingUserId,
        toEmail,
        messageType,
        subject,
        templateKey: normalizeString(body.template_key) || null,
        provider,
        providerMessageId: null,
        status: "failed",
        error: throttleCheck.error || "Throttle check failed",
        meta: { stage: "throttle" },
      });
      continue;
    }

    let attempt: SendAttemptResult;

    if (provider === "sender") {
      if (!senderToken) {
        attempt = {
          ok: false,
          providerMessageId: null,
          raw: null,
          error: "SENDER_API_TOKEN is missing.",
        };
      } else {
        attempt = await sendViaSender({
          token: senderToken,
          fromEmail: defaultFromEmail,
          fromName: defaultFromName,
          toEmail,
          toName: normalizeString(body.to_name) || "Recipient",
          subject,
          html: withFooter.html,
        });
      }
    } else if (provider === "brevo") {
      if (!brevoApiKey) {
        attempt = {
          ok: false,
          providerMessageId: null,
          raw: null,
          error: "BREVO_API_KEY is missing.",
        };
      } else {
        attempt = await sendViaBrevo({
          apiKey: brevoApiKey,
          fromEmail: defaultFromEmail,
          fromName: defaultFromName,
          toEmail,
          toName: normalizeString(body.to_name) || "Recipient",
          subject,
          html: withFooter.html,
          text: withFooter.text,
        });
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
          messageType,
          unsubscribed: contact.unsubscribed,
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
      userId: actingUserId,
      toEmail,
      messageType,
      subject,
      templateKey: normalizeString(body.template_key) || null,
      provider,
      providerMessageId: attempt.providerMessageId,
      status,
      error: attempt.error,
      meta: {
        response: attempt.raw,
        payload_data: body.data || {},
      },
    });

    if (attempt.ok) {
      return json(200, {
        success: true,
        message_id: messageId,
        provider,
        status: "sent",
      });
    }
  }

  return json(502, {
    success: false,
    error: "All configured providers failed for this send request.",
    status: "failed",
  });
}

async function handleWebhook(req: Request, provider: Provider): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json(500, { success: false, error: "Supabase environment not configured." });
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { success: false, error: "Invalid webhook JSON body." });
  }

  const providerUpper = provider.toUpperCase();
  const expectedSecret = normalizeString(Deno.env.get(`EMAIL_WEBHOOK_SECRET_${providerUpper}`));
  const signature = normalizeString(
    req.headers.get("x-signature")
      || req.headers.get("x-webhook-signature")
      || req.headers.get("x-sender-signature")
      || "",
  );

  const verified = Boolean(expectedSecret && signature && expectedSecret === signature);
  const unverified = expectedSecret ? !verified : true;

  const eventType = inferWebhookEventType(payload);
  const providerMessageId = extractProviderMessageId(payload);
  const email = inferWebhookEmail(payload);
  const mappedStatus = mapWebhookStatus(eventType);

  let tenantId: string | null = normalizeString(payload.tenant_id) || null;
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

  const { error: eventInsertError } = await serviceClient
    .from("esp_webhook_events")
    .insert({
      tenant_id: tenantId,
      provider,
      provider_message_id: providerMessageId,
      event_type: eventType,
      payload: {
        ...payload,
        webhook_unverified: unverified,
        webhook_verified: verified,
      },
    });

  if (eventInsertError) {
    return json(500, { success: false, error: eventInsertError.message });
  }

  if (mappedStatus && providerMessageId) {
    await serviceClient
      .from("esp_messages")
      .update({ status: mappedStatus })
      .eq("provider", provider)
      .eq("provider_message_id", providerMessageId);
  }

  if (mappedStatus === "unsubscribed" && tenantId && (email || messageRow?.to_email)) {
    const targetEmail = email || messageRow?.to_email || "";

    await serviceClient
      .from("esp_contacts")
      .update({
        unsubscribed: true,
        consent_marketing: false,
        consent_transactional: false,
      })
      .eq("tenant_id", tenantId)
      .eq("email", targetEmail.toLowerCase());

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
          },
        });
    }
  }

  return json(200, {
    success: true,
    provider,
    event_type: eventType,
    provider_message_id: providerMessageId,
    webhook_unverified: unverified,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    const isSendRoute = pathname === "/" || pathname.endsWith("/send") || pathname.endsWith("/email-orchestrator");

    if (req.method === "POST" && isSendRoute) {
      return await handleSend(req);
    }

    if (req.method === "POST" && pathname.endsWith("/webhook/sender")) {
      return await handleWebhook(req, "sender");
    }

    if (req.method === "POST" && pathname.endsWith("/webhook/brevo")) {
      return await handleWebhook(req, "brevo");
    }

    if (req.method === "POST" && pathname.endsWith("/webhook/mailerlite")) {
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
