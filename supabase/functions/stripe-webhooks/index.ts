import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@14.25.0";

type Tier = "free" | "growth" | "premium";
type PlanCode = "FREE" | "GROWTH" | "PREMIUM";
type LifecycleEmail = "activated" | "canceled" | "payment_failed";
type SubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete";

type SubscriptionRow = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  tier: string | null;
  plan_code: string | null;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
};

type UpsertResult = {
  row: SubscriptionRow;
  previous: { tier: Tier; status: string } | null;
  rawStripeStatus: string;
  downgradedToFree: boolean;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, stripe-signature",
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

function normalizeEmail(value: unknown): string | null {
  const email = normalizeString(value).toLowerCase();
  return email || null;
}

function toIsoFromUnix(seconds: number | null | undefined): string | null {
  if (!seconds || Number.isNaN(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function toTier(value: unknown): Tier | null {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "free" || normalized === "growth" || normalized === "premium") {
    return normalized as Tier;
  }
  return null;
}

function tierToPlanCode(tier: Tier): PlanCode {
  return tier.toUpperCase() as PlanCode;
}

function mapStripeStatus(rawStatus: string, eventType: string): SubscriptionStatus {
  if (eventType === "customer.subscription.deleted") return "canceled";

  const normalized = normalizeString(rawStatus).toLowerCase();
  if (normalized === "active" || normalized === "trialing") return "active";
  if (normalized === "canceled") return "canceled";
  if (normalized === "past_due" || normalized === "unpaid") return "past_due";
  if (normalized === "incomplete" || normalized === "incomplete_expired") return "incomplete";
  return "incomplete";
}

function shouldDowngradeToFree(rawStatus: string, eventType: string): boolean {
  if (eventType === "customer.subscription.deleted") return true;
  const normalized = normalizeString(rawStatus).toLowerCase();
  return ["canceled", "unpaid", "past_due", "incomplete_expired"].includes(normalized);
}

function isWebhookRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  return path.endsWith("/webhook") || path.endsWith("/stripe-webhooks");
}

async function resolveTenantId(serviceClient: SupabaseClient, userId: string): Promise<string | null> {
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

async function writeAuditEvent(params: {
  serviceClient: SupabaseClient;
  tenantId: string | null;
  userId: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
}) {
  if (!params.tenantId) return;

  const firstTry = await params.serviceClient.from("audit_events").insert({
    tenant_id: params.tenantId,
    actor_user_id: params.userId,
    event_type: params.eventType,
    metadata: params.metadata,
  });

  if (!firstTry.error) return;

  await params.serviceClient.from("audit_events").insert({
    tenant_id: params.tenantId,
    actor_user_id: params.userId,
    actor_type: "system",
    action: params.eventType,
    entity_type: "subscription",
    entity_id: String(params.metadata.subscription_id || params.metadata.stripe_subscription_id || "stripe"),
    metadata: params.metadata,
  });
}

async function alreadyProcessedEvent(serviceClient: SupabaseClient, eventId: string): Promise<boolean> {
  const { data, error } = await serviceClient
    .from("subscription_events")
    .select("id")
    .eq("provider", "stripe")
    .eq("provider_event_id", eventId)
    .limit(1)
    .maybeSingle();

  return !error && Boolean(data?.id);
}

async function findSubscriptionByStripeSubId(serviceClient: SupabaseClient, stripeSubscriptionId: string): Promise<SubscriptionRow | null> {
  const byNewColumn = await serviceClient
    .from("subscriptions")
    .select("id,user_id,tenant_id,tier,plan_code,status,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .limit(1)
    .maybeSingle();

  if (!byNewColumn.error && byNewColumn.data) {
    return byNewColumn.data as SubscriptionRow;
  }

  const byLegacy = await serviceClient
    .from("subscriptions")
    .select("id,user_id,tenant_id,tier,plan_code,status,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end")
    .eq("provider_subscription_id", stripeSubscriptionId)
    .limit(1)
    .maybeSingle();

  if (!byLegacy.error && byLegacy.data) {
    return byLegacy.data as SubscriptionRow;
  }

  return null;
}

async function findSubscriptionByStripeCustomerId(serviceClient: SupabaseClient, stripeCustomerId: string): Promise<SubscriptionRow | null> {
  const byNewColumn = await serviceClient
    .from("subscriptions")
    .select("id,user_id,tenant_id,tier,plan_code,status,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end")
    .eq("stripe_customer_id", stripeCustomerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!byNewColumn.error && byNewColumn.data) {
    return byNewColumn.data as SubscriptionRow;
  }

  const byLegacy = await serviceClient
    .from("subscriptions")
    .select("id,user_id,tenant_id,tier,plan_code,status,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end")
    .eq("provider_customer_id", stripeCustomerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!byLegacy.error && byLegacy.data) {
    return byLegacy.data as SubscriptionRow;
  }

  return null;
}

async function resolveUserFromCustomerId(
  serviceClient: SupabaseClient,
  customerId: string,
): Promise<{ userId: string; tenantId: string | null } | null> {
  const mapped = await serviceClient
    .from("stripe_customers")
    .select("user_id,tenant_id")
    .eq("stripe_customer_id", customerId)
    .limit(1)
    .maybeSingle();

  if (!mapped.error && mapped.data?.user_id) {
    return {
      userId: String(mapped.data.user_id),
      tenantId: mapped.data.tenant_id ? String(mapped.data.tenant_id) : null,
    };
  }

  const fromSub = await findSubscriptionByStripeCustomerId(serviceClient, customerId);
  if (fromSub) {
    return {
      userId: fromSub.user_id,
      tenantId: fromSub.tenant_id,
    };
  }

  return null;
}

async function resolveTierFromPriceId(
  serviceClient: SupabaseClient,
  priceId: string | null,
  stripeGrowthPriceId: string,
  stripePremiumPriceId: string,
): Promise<Tier | null> {
  if (!priceId) return null;

  const planRes = await serviceClient
    .from("subscription_plans")
    .select("tier")
    .eq("stripe_price_id", priceId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!planRes.error && planRes.data?.tier) {
    return toTier(planRes.data.tier);
  }

  if (priceId === stripeGrowthPriceId) return "growth";
  if (priceId === stripePremiumPriceId) return "premium";

  return null;
}

async function upsertStripeCustomerMapping(params: {
  serviceClient: SupabaseClient;
  userId: string;
  tenantId: string | null;
  stripeCustomerId: string;
}) {
  await params.serviceClient
    .from("stripe_customers")
    .upsert(
      {
        user_id: params.userId,
        tenant_id: params.tenantId,
        stripe_customer_id: params.stripeCustomerId,
      },
      { onConflict: "user_id" },
    );
}

async function upsertSubscriptionFromStripe(params: {
  serviceClient: SupabaseClient;
  stripeSubscription: Stripe.Subscription;
  eventType: string;
  stripeGrowthPriceId: string;
  stripePremiumPriceId: string;
}): Promise<UpsertResult | null> {
  const subscriptionId = params.stripeSubscription.id;
  const customerId = typeof params.stripeSubscription.customer === "string"
    ? params.stripeSubscription.customer
    : params.stripeSubscription.customer?.id || null;

  const existingBySubId = await findSubscriptionByStripeSubId(params.serviceClient, subscriptionId);
  const existingByCustomerId = customerId
    ? await findSubscriptionByStripeCustomerId(params.serviceClient, customerId)
    : null;

  const existing = existingBySubId || existingByCustomerId;

  const metadataUserId = normalizeString(params.stripeSubscription.metadata?.user_id) || null;
  const metadataTenantId = normalizeString(params.stripeSubscription.metadata?.tenant_id) || null;
  const metadataTier = toTier(params.stripeSubscription.metadata?.tier)
    || toTier(params.stripeSubscription.metadata?.plan_code);

  const mappedFromCustomer = customerId
    ? await resolveUserFromCustomerId(params.serviceClient, customerId)
    : null;

  const userId = existing?.user_id
    || mappedFromCustomer?.userId
    || metadataUserId;

  if (!userId) return null;

  let tenantId = existing?.tenant_id
    || mappedFromCustomer?.tenantId
    || metadataTenantId
    || null;

  if (!tenantId) {
    tenantId = await resolveTenantId(params.serviceClient, userId);
  }

  const firstPriceId = params.stripeSubscription.items?.data?.[0]?.price?.id || null;
  const mappedTier = await resolveTierFromPriceId(
    params.serviceClient,
    firstPriceId,
    params.stripeGrowthPriceId,
    params.stripePremiumPriceId,
  );

  const existingTier = toTier(existing?.tier) || toTier(existing?.plan_code);
  const rawStripeStatus = normalizeString(params.stripeSubscription.status);
  const downgradedToFree = shouldDowngradeToFree(rawStripeStatus, params.eventType);
  const nextTier: Tier = downgradedToFree
    ? "free"
    : mappedTier || metadataTier || existingTier || "free";

  const status = mapStripeStatus(rawStripeStatus, params.eventType);
  const cancelAtPeriodEnd = Boolean(params.stripeSubscription.cancel_at_period_end);
  const currentPeriodEnd = toIsoFromUnix(params.stripeSubscription.current_period_end);

  if (customerId) {
    await upsertStripeCustomerMapping({
      serviceClient: params.serviceClient,
      userId,
      tenantId,
      stripeCustomerId: customerId,
    });
  }

  const previous = existing
    ? {
      tier: toTier(existing.tier) || toTier(existing.plan_code) || "free",
      status: normalizeString(existing.status) || "active",
    }
    : null;

  const payload = {
    tenant_id: tenantId,
    user_id: userId,
    tier: nextTier,
    plan_code: tierToPlanCode(nextTier),
    status,
    provider: "stripe",
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    provider_customer_id: customerId,
    provider_subscription_id: subscriptionId,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const updateRes = await params.serviceClient
      .from("subscriptions")
      .update(payload)
      .eq("id", existing.id)
      .select("id,user_id,tenant_id,tier,plan_code,status,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end")
      .single();

    if (updateRes.error || !updateRes.data) {
      throw new Error(updateRes.error?.message || "Unable to update subscription from Stripe.");
    }

    return {
      row: updateRes.data as SubscriptionRow,
      previous,
      rawStripeStatus,
      downgradedToFree,
    };
  }

  const insertRes = await params.serviceClient
    .from("subscriptions")
    .insert(payload)
    .select("id,user_id,tenant_id,tier,plan_code,status,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end")
    .single();

  if (insertRes.error || !insertRes.data) {
    throw new Error(insertRes.error?.message || "Unable to create subscription from Stripe.");
  }

  return {
    row: insertRes.data as SubscriptionRow,
    previous,
    rawStripeStatus,
    downgradedToFree,
  };
}

async function insertSubscriptionEvent(params: {
  serviceClient: SupabaseClient;
  subscriptionId: string;
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const insertRes = await params.serviceClient
    .from("subscription_events")
    .insert({
      subscription_id: params.subscriptionId,
      provider: "stripe",
      provider_event_id: params.providerEventId,
      event_type: params.eventType,
      payload: params.payload,
    });

  if (insertRes.error && insertRes.error.code !== "23505") {
    throw new Error(insertRes.error.message || "Unable to record subscription event.");
  }
}

async function fetchStripeCustomerContact(
  stripe: Stripe,
  customerId: string | null,
): Promise<{ email: string | null; name: string | null }> {
  if (!customerId) return { email: null, name: null };

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return { email: null, name: null };
    return {
      email: normalizeEmail(customer.email),
      name: normalizeString(customer.name) || null,
    };
  } catch {
    return { email: null, name: null };
  }
}

function classifyLifecycleEmail(params: {
  eventType: string;
  row: SubscriptionRow;
  previous: { tier: Tier; status: string } | null;
  downgradedToFree: boolean;
}): LifecycleEmail | null {
  const currentTier = toTier(params.row.tier) || toTier(params.row.plan_code) || "free";
  const currentStatus = normalizeString(params.row.status).toLowerCase();
  const prevStatus = normalizeString(params.previous?.status).toLowerCase();
  const prevTier = params.previous?.tier || "free";

  if (params.eventType === "customer.subscription.deleted" || currentStatus === "canceled") {
    if (prevStatus !== "canceled") return "canceled";
    return null;
  }

  if (currentStatus === "past_due" || currentStatus === "incomplete" || params.downgradedToFree) {
    if (prevStatus !== "past_due" && prevStatus !== "incomplete") return "payment_failed";
    return null;
  }

  if (currentStatus === "active" && currentTier !== "free") {
    if (!params.previous) return "activated";
    if (prevStatus !== "active" || prevTier !== currentTier) return "activated";
  }

  return null;
}

function buildEmailCopy(kind: LifecycleEmail, tier: Tier): { subject: string; html: string; text: string } {
  if (kind === "activated") {
    return {
      subject: `Nexus membership active: ${tier.toUpperCase()}`,
      html: `
        <p>Your Nexus ${tier.toUpperCase()} membership is now active.</p>
        <p>You can access your plan modules from Billing.</p>
        <p>Educational workflow tools only. Results vary and are not guaranteed.</p>
      `.trim(),
      text: `Your Nexus ${tier.toUpperCase()} membership is now active.\n\nEducational workflow tools only. Results vary and are not guaranteed.`,
    };
  }

  if (kind === "canceled") {
    return {
      subject: "Nexus membership canceled",
      html: `
        <p>Your paid Nexus subscription has been canceled or ended.</p>
        <p>Your account is now on the FREE tier.</p>
        <p>Educational workflow tools only. Results vary and are not guaranteed.</p>
      `.trim(),
      text: "Your paid Nexus subscription has been canceled or ended. Your account is now on the FREE tier.",
    };
  }

  return {
    subject: "Action needed: payment issue on your Nexus membership",
    html: `
      <p>We could not process your latest membership payment.</p>
      <p>Your paid features may be limited until billing is resolved.</p>
      <p>Educational workflow tools only. Results vary and are not guaranteed.</p>
    `.trim(),
    text: "We could not process your latest membership payment. Paid features may be limited until billing is resolved.",
  };
}

async function sendBrevoEmail(params: {
  toEmail: string;
  toName: string | null;
  kind: LifecycleEmail;
  tier: Tier;
  messageType: string;
  metadata: Record<string, unknown>;
}) {
  const brevoApiKey = normalizeString(Deno.env.get("BREVO_API_KEY"));
  const resendApiKey = normalizeString(Deno.env.get("RESEND_API_KEY"));
  const transactionalProviderPreference = normalizeString(Deno.env.get("EMAIL_TRANSACTIONAL_PROVIDER")).toLowerCase();
  const fromEmail = normalizeString(Deno.env.get("DEFAULT_FROM_EMAIL"));
  const fromName = normalizeString(Deno.env.get("DEFAULT_FROM_NAME")) || "Nexus CRM";

  if (!fromEmail) {
    return { sent: false, reason: "default_from_email_missing" };
  }

  const copy = buildEmailCopy(params.kind, params.tier);
  const educationalFooter = "Educational only. No guarantees of outcomes.";

  const prefersResend = transactionalProviderPreference === "resend" || transactionalProviderPreference === "" || transactionalProviderPreference === "auto";
  const prefersBrevo = transactionalProviderPreference === "brevo";

  if ((prefersResend && resendApiKey) || (!brevoApiKey && resendApiKey)) {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [params.toEmail],
        subject: copy.subject,
        html: `${copy.html}<hr style="margin-top:24px;border:none;border-top:1px solid #e2e8f0"/><p style="font-size:12px;color:#64748b">${educationalFooter}</p>`,
        text: `${copy.text}\n\n${educationalFooter}`,
        headers: {
          "X-Nexus-Message-Type": params.messageType,
        },
        tags: [
          { name: "message_type", value: params.messageType },
        ],
      }),
    });

    if (!resendResponse.ok) {
      return { sent: false, reason: `resend_http_${resendResponse.status}` };
    }

    return { sent: true, reason: "ok_resend" };
  }

  if ((prefersBrevo || !resendApiKey) && brevoApiKey) {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify({
        sender: {
          name: fromName,
          email: fromEmail,
        },
        to: [
          {
            email: params.toEmail,
            name: params.toName || undefined,
          },
        ],
        subject: copy.subject,
        htmlContent: `${copy.html}<hr style="margin-top:24px;border:none;border-top:1px solid #e2e8f0"/><p style="font-size:12px;color:#64748b">${educationalFooter}</p>`,
        textContent: `${copy.text}\n\n${educationalFooter}`,
        headers: {
          "X-Nexus-Message-Type": params.messageType,
        },
        params: params.metadata,
      }),
    });

    if (!response.ok) {
      return { sent: false, reason: `brevo_http_${response.status}` };
    }

    return { sent: true, reason: "ok_brevo" };
  }

  return { sent: false, reason: "transactional_email_provider_not_configured" };
}
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method not allowed." });
  }

  if (!isWebhookRoute(new URL(req.url).pathname)) {
    return json(404, { success: false, error: "Route not found." });
  }

  const stripeSecretKey = normalizeString(Deno.env.get("STRIPE_SECRET_KEY"));
  const stripeWebhookSecret = normalizeString(Deno.env.get("STRIPE_WEBHOOK_SECRET"));
  const stripeGrowthPriceId = normalizeString(Deno.env.get("STRIPE_PRICE_GROWTH"));
  const stripePremiumPriceId = normalizeString(Deno.env.get("STRIPE_PRICE_PREMIUM"));

  const supabaseUrl = normalizeString(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeString(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  if (!stripeSecretKey || !stripeWebhookSecret) {
    return json(500, { success: false, error: "Stripe webhook configuration missing." });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { success: false, error: "Supabase service configuration missing." });
  }

  const signature = req.headers.get("stripe-signature") || "";
  if (!signature) {
    return json(400, { success: false, error: "Missing stripe-signature header." });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, stripeWebhookSecret);
  } catch (error) {
    return json(400, {
      success: false,
      error: error instanceof Error ? error.message : "Invalid webhook signature.",
    });
  }

  const supportedEvents = new Set<string>([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ]);

  if (!supportedEvents.has(event.type)) {
    return json(200, { success: true, ignored: true, event_type: event.type });
  }

  try {
    if (await alreadyProcessedEvent(serviceClient, event.id)) {
      return json(200, { success: true, duplicate: true, event_type: event.type });
    }

    let result: UpsertResult | null = null;
    let contactEmail: string | null = null;
    let contactName: string | null = null;
    let stripeSubscriptionId: string | null = null;
    let stripeCustomerId: string | null = null;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      stripeSubscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || null;

      stripeCustomerId = typeof session.customer === "string"
        ? session.customer
        : session.customer?.id || null;

      contactEmail = normalizeEmail(session.customer_details?.email);
      contactName = normalizeString(session.customer_details?.name) || null;

      if (!stripeSubscriptionId) {
        return json(200, { success: true, ignored: true, reason: "no_subscription_id" });
      }

      const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      result = await upsertSubscriptionFromStripe({
        serviceClient,
        stripeSubscription,
        eventType: event.type,
        stripeGrowthPriceId,
        stripePremiumPriceId,
      });

      if (result) {
        await insertSubscriptionEvent({
          serviceClient,
          subscriptionId: result.row.id,
          providerEventId: event.id,
          eventType: event.type,
          payload: {
            checkout_session_id: session.id,
            stripe_subscription_id: stripeSubscriptionId,
            stripe_customer_id: stripeCustomerId,
            amount_total: session.amount_total,
            currency: session.currency,
            mode: session.mode,
          },
        });
      }
    } else {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      stripeSubscriptionId = stripeSubscription.id;
      stripeCustomerId = typeof stripeSubscription.customer === "string"
        ? stripeSubscription.customer
        : stripeSubscription.customer?.id || null;

      result = await upsertSubscriptionFromStripe({
        serviceClient,
        stripeSubscription,
        eventType: event.type,
        stripeGrowthPriceId,
        stripePremiumPriceId,
      });

      if (result) {
        await insertSubscriptionEvent({
          serviceClient,
          subscriptionId: result.row.id,
          providerEventId: event.id,
          eventType: event.type,
          payload: {
            stripe_subscription_id: stripeSubscription.id,
            stripe_customer_id: stripeCustomerId,
            stripe_status: stripeSubscription.status,
            cancel_at_period_end: stripeSubscription.cancel_at_period_end,
            current_period_end: toIsoFromUnix(stripeSubscription.current_period_end),
            latest_price_id: stripeSubscription.items?.data?.[0]?.price?.id || null,
          },
        });
      }
    }

    if (!result) {
      return json(200, { success: true, ignored: true, reason: "no_matching_user", event_type: event.type });
    }

    const effectiveTier = toTier(result.row.tier) || toTier(result.row.plan_code) || "free";

    await writeAuditEvent({
      serviceClient,
      tenantId: result.row.tenant_id,
      userId: result.row.user_id,
      eventType: "stripe.subscription.synced",
      metadata: {
        provider_event_id: event.id,
        stripe_event_type: event.type,
        subscription_id: result.row.id,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_customer_id: stripeCustomerId,
        tier: effectiveTier,
        status: result.row.status,
        downgraded_to_free: result.downgradedToFree,
      },
    });

    const lifecycleEmail = classifyLifecycleEmail({
      eventType: event.type,
      row: result.row,
      previous: result.previous,
      downgradedToFree: result.downgradedToFree,
    });

    if (!contactEmail || !contactName) {
      const stripeContact = await fetchStripeCustomerContact(stripe, stripeCustomerId);
      contactEmail = contactEmail || stripeContact.email;
      contactName = contactName || stripeContact.name;
    }

    if (lifecycleEmail && contactEmail) {
      const emailResult = await sendBrevoEmail({
        toEmail: contactEmail,
        toName: contactName,
        kind: lifecycleEmail,
        tier: effectiveTier,
        messageType: "billing",
        metadata: {
          event_type: event.type,
          subscription_id: result.row.id,
          tier: effectiveTier,
          status: result.row.status,
        },
      });

      await writeAuditEvent({
        serviceClient,
        tenantId: result.row.tenant_id,
        userId: result.row.user_id,
        eventType: `stripe.subscription.email_${lifecycleEmail}`,
        metadata: {
          provider_event_id: event.id,
          subscription_id: result.row.id,
          sent: emailResult.sent,
          reason: emailResult.reason,
        },
      });
    }

    return json(200, {
      success: true,
      received: true,
      event_type: event.type,
      subscription_id: result.row.id,
      tier: effectiveTier,
      status: result.row.status,
    });
  } catch (error) {
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Stripe webhook processing failed.",
      event_type: event.type,
    });
  }
});
