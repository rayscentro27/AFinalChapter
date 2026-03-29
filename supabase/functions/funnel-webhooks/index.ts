import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type RouteAction = "brevo" | "stripe";

type LeadRow = {
  id: string;
  tenant_id: string | null;
  email: string;
  status: string;
  marketing_opt_in: boolean;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-webhook-signature",
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

function parseRoute(pathname: string, action: string): RouteAction | null {
  const normalized = pathname.replace(/\/+$/, "");

  if (normalized.endsWith("/brevo")) return "brevo";
  if (normalized.endsWith("/stripe")) return "stripe";

  if (normalized.endsWith("/funnel-webhooks")) {
    if (action === "brevo") return "brevo";
    if (action === "stripe") return "stripe";
  }

  return null;
}

async function findLeadByEmail(serviceClient: SupabaseClient, email: string): Promise<LeadRow | null> {
  const leadRes = await serviceClient
    .from("leads")
    .select("id,tenant_id,email,status,marketing_opt_in")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leadRes.error || !leadRes.data) return null;
  return leadRes.data as LeadRow;
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

async function writeAuditEvent(serviceClient: SupabaseClient, params: {
  tenantId: string;
  eventType: string;
  metadata: Record<string, unknown>;
}) {
  const first = await serviceClient.from("audit_events").insert({
    tenant_id: params.tenantId,
    actor_user_id: null,
    event_type: params.eventType,
    metadata: params.metadata,
  });

  if (!first.error) return;

  await serviceClient.from("audit_events").insert({
    tenant_id: params.tenantId,
    actor_user_id: null,
    actor_type: "system",
    action: params.eventType,
    entity_type: "funnel",
    entity_id: String(params.metadata.lead_id || "funnel"),
    metadata: params.metadata,
  });
}

async function updateDailyUpgradeMetric(serviceClient: SupabaseClient, tenantId: string, tier: "growth" | "premium") {
  const day = new Date().toISOString().slice(0, 10);

  const existing = await serviceClient
    .from("funnel_metrics_daily")
    .select("tenant_id,day,upgrades_growth,upgrades_premium")
    .eq("tenant_id", tenantId)
    .eq("day", day)
    .limit(1)
    .maybeSingle();

  if (existing.error || !existing.data) {
    const payload = {
      tenant_id: tenantId,
      day,
      visitors: 0,
      leads: 0,
      optins: 0,
      signups: 0,
      upgrades_growth: tier === "growth" ? 1 : 0,
      upgrades_premium: tier === "premium" ? 1 : 0,
      outcomes_approved: 0,
    };

    await serviceClient.from("funnel_metrics_daily").upsert(payload, {
      onConflict: "tenant_id,day",
    });
    return;
  }

  const growth = Number(existing.data.upgrades_growth || 0);
  const premium = Number(existing.data.upgrades_premium || 0);

  await serviceClient
    .from("funnel_metrics_daily")
    .update({
      upgrades_growth: tier === "growth" ? growth + 1 : growth,
      upgrades_premium: tier === "premium" ? premium + 1 : premium,
    })
    .eq("tenant_id", tenantId)
    .eq("day", day);
}

function mapBrevoEventType(raw: string): string {
  const event = normalizeString(raw).toLowerCase();
  if (!event) return "EMAIL_EVENT";
  if (event.includes("deliver") || event === "sent") return "EMAIL_DELIVERED";
  if (event.includes("open")) return "EMAIL_OPENED";
  if (event.includes("click")) return "EMAIL_CLICKED";
  if (event.includes("bounce")) return "EMAIL_BOUNCED";
  if (event.includes("unsub")) return "LEAD_UNSUBSCRIBED";
  return "EMAIL_EVENT";
}

async function processBrevoWebhook(serviceClient: SupabaseClient, payload: unknown): Promise<{ processed: number }> {
  const events = Array.isArray(payload) ? payload : [payload];
  let processed = 0;

  for (const eventRaw of events) {
    const event = asObject(eventRaw);
    const email = normalizeEmail(event.email || event.recipient || event.to);
    if (!email) continue;

    const lead = await findLeadByEmail(serviceClient, email);
    if (!lead || !lead.tenant_id) continue;

    const eventType = mapBrevoEventType(String(event.event || event.type || event.event_type || ""));

    if (eventType === "LEAD_UNSUBSCRIBED") {
      await serviceClient
        .from("leads")
        .update({
          status: "unsubscribed",
          marketing_opt_in: false,
        })
        .eq("id", lead.id);

      await serviceClient
        .from("funnel_enrollments")
        .update({
          status: "canceled",
          last_error: "unsubscribed",
        })
        .eq("lead_id", lead.id)
        .eq("status", "enrolled");

      await serviceClient
        .from("esp_contacts")
        .update({
          unsubscribed: true,
          consent_marketing: false,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", lead.tenant_id)
        .eq("email", email);
    }

    if (eventType === "EMAIL_BOUNCED") {
      await serviceClient
        .from("leads")
        .update({
          status: "dead",
        })
        .eq("id", lead.id)
        .neq("status", "converted");
    }

    await insertLeadEvent(serviceClient, {
      tenantId: lead.tenant_id,
      leadId: lead.id,
      eventType,
      payload: {
        provider: "brevo",
        provider_message_id: normalizeString(event["message-id"] || event.messageId || event.message_id || event.id) || null,
        provider_event: normalizeString(event.event || event.type || event.event_type),
      },
    });

    await writeAuditEvent(serviceClient, {
      tenantId: lead.tenant_id,
      eventType: "funnel.webhook_brevo",
      metadata: {
        lead_id: lead.id,
        event_type: eventType,
      },
    });

    processed += 1;
  }

  return { processed };
}

function parseStripeTier(payload: Record<string, unknown>): "growth" | "premium" | null {
  const candidates: string[] = [];

  const dataObject = asObject(asObject(payload.data).object);
  const metadata = asObject(dataObject.metadata);

  candidates.push(normalizeString(metadata.tier));
  candidates.push(normalizeString(dataObject.plan_code));

  const items = asObject(dataObject.items);
  const itemRows = Array.isArray(items.data) ? items.data : [];

  for (const item of itemRows) {
    const price = asObject(asObject(item).price);
    candidates.push(normalizeString(price.lookup_key));
    candidates.push(normalizeString(price.id));
    const product = asObject(price.product);
    candidates.push(normalizeString(product.name));
  }

  for (const candidate of candidates) {
    const value = candidate.toLowerCase();
    if (!value) continue;
    if (value.includes("premium")) return "premium";
    if (value.includes("growth")) return "growth";
  }

  return null;
}

async function resolveLeadForStripeEvent(serviceClient: SupabaseClient, payload: Record<string, unknown>): Promise<{ lead: LeadRow | null; tenantId: string | null; tier: "growth" | "premium" | null }> {
  const dataObject = asObject(asObject(payload.data).object);

  const customerEmail = normalizeEmail(
    dataObject.customer_email ||
    asObject(dataObject.customer_details).email ||
    dataObject.email,
  );

  const stripeCustomerId = normalizeString(dataObject.customer);
  const stripeSubscriptionId = normalizeString(dataObject.subscription || dataObject.id);

  const tierFromPayload = parseStripeTier(payload);

  if (stripeCustomerId || stripeSubscriptionId) {
    let subQuery = serviceClient
      .from("subscriptions")
      .select("user_id,tenant_id,tier,plan_code")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (stripeSubscriptionId) {
      subQuery = subQuery.eq("stripe_subscription_id", stripeSubscriptionId);
    } else if (stripeCustomerId) {
      subQuery = subQuery.eq("stripe_customer_id", stripeCustomerId);
    }

    const subRes = await subQuery.maybeSingle();

    if (!subRes.error && subRes.data?.user_id) {
      const tenantId = normalizeString(subRes.data.tenant_id);
      const subTier = normalizeString(subRes.data.tier || subRes.data.plan_code).toLowerCase();
      const tier = tierFromPayload || (subTier === "premium" ? "premium" : subTier === "growth" ? "growth" : null);

      const linkRes = await serviceClient
        .from("lead_user_links")
        .select("lead_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", String(subRes.data.user_id))
        .order("linked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!linkRes.error && linkRes.data?.lead_id) {
        const leadRes = await serviceClient
          .from("leads")
          .select("id,tenant_id,email,status,marketing_opt_in")
          .eq("id", String(linkRes.data.lead_id))
          .limit(1)
          .maybeSingle();

        if (!leadRes.error && leadRes.data) {
          return {
            lead: leadRes.data as LeadRow,
            tenantId,
            tier,
          };
        }
      }

      return {
        lead: null,
        tenantId,
        tier,
      };
    }
  }

  if (customerEmail) {
    const lead = await findLeadByEmail(serviceClient, customerEmail);
    return {
      lead,
      tenantId: normalizeString(lead?.tenant_id),
      tier: tierFromPayload,
    };
  }

  return {
    lead: null,
    tenantId: null,
    tier: tierFromPayload,
  };
}

async function processStripeWebhook(serviceClient: SupabaseClient, payload: unknown): Promise<{ processed: number }> {
  const event = asObject(payload);
  const eventType = normalizeString(event.type).toLowerCase();

  if (!eventType) {
    return { processed: 0 };
  }

  const isUpgradeEvent = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
  ].includes(eventType);

  if (!isUpgradeEvent) {
    return { processed: 0 };
  }

  const resolved = await resolveLeadForStripeEvent(serviceClient, event);
  if (!resolved.tenantId || !resolved.tier) {
    return { processed: 0 };
  }

  if (resolved.lead) {
    await insertLeadEvent(serviceClient, {
      tenantId: resolved.tenantId,
      leadId: resolved.lead.id,
      eventType: "UPGRADED",
      payload: {
        provider: "stripe",
        tier: resolved.tier,
        source_event: eventType,
      },
    });
  }

  await updateDailyUpgradeMetric(serviceClient, resolved.tenantId, resolved.tier);

  await writeAuditEvent(serviceClient, {
    tenantId: resolved.tenantId,
    eventType: "funnel.webhook_stripe_upgrade",
    metadata: {
      lead_id: resolved.lead?.id || null,
      tier: resolved.tier,
      source_event: eventType,
    },
  });

  return { processed: 1 };
}

function isWebhookSignatureValid(req: Request, expectedSecret: string): boolean {
  if (!expectedSecret) return true;
  const provided =
    normalizeString(req.headers.get("x-signature")) ||
    normalizeString(req.headers.get("x-webhook-signature"));
  return Boolean(provided) && provided === expectedSecret;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method not allowed." });
  }

  const supabaseUrl = normalizeString(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeString(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { success: false, error: "Supabase environment is not configured." });
  }

  const route = parseRoute(new URL(req.url).pathname, normalizeString(new URL(req.url).searchParams.get("action")).toLowerCase());
  if (!route) {
    return json(404, { success: false, error: "Route not found." });
  }

  const brevoSecret = normalizeString(Deno.env.get("EMAIL_WEBHOOK_SECRET_BREVO"));
  const stripeSecret = normalizeString(Deno.env.get("FUNNEL_STRIPE_WEBHOOK_SECRET") || Deno.env.get("STRIPE_WEBHOOK_SECRET"));

  if (route === "brevo" && !isWebhookSignatureValid(req, brevoSecret)) {
    return json(401, { success: false, error: "Invalid Brevo webhook signature." });
  }

  if (route === "stripe" && !isWebhookSignatureValid(req, stripeSecret)) {
    return json(401, { success: false, error: "Invalid Stripe webhook signature." });
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (route === "brevo") {
      const result = await processBrevoWebhook(serviceClient, payload);
      return json(200, {
        success: true,
        route,
        processed: result.processed,
      });
    }

    const result = await processStripeWebhook(serviceClient, payload);
    return json(200, {
      success: true,
      route,
      processed: result.processed,
    });
  } catch (error) {
    return json(400, {
      success: false,
      error: normalizeString((error as Error)?.message || error),
    });
  }
});
