import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@14.25.0";

type PlanCode = "FREE" | "GROWTH" | "PREMIUM";
type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";

type SubscriptionRow = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  plan_code: PlanCode;
  provider_customer_id: string | null;
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
    },
  });
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toIsoFromUnix(seconds: number | null | undefined): string | null {
  if (!seconds || Number.isNaN(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function mapStripeStatusToSubscriptionStatus(input: string): SubscriptionStatus {
  const status = input.toLowerCase();
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "canceled") return "canceled";
  if (["past_due", "unpaid", "incomplete", "incomplete_expired", "paused"].includes(status)) {
    return "past_due";
  }
  return "past_due";
}

function planCodeFromPriceId(priceId: string | null, stripeGrowthPriceId: string, stripePremiumPriceId: string): PlanCode | null {
  if (!priceId) return null;
  if (priceId === stripeGrowthPriceId) return "GROWTH";
  if (priceId === stripePremiumPriceId) return "PREMIUM";
  return null;
}

function normalizePlanCode(value: unknown): PlanCode | null {
  const normalized = normalizeString(value).toUpperCase();
  if (normalized === "FREE" || normalized === "GROWTH" || normalized === "PREMIUM") {
    return normalized as PlanCode;
  }
  return null;
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
    entity_id: String(params.metadata.subscription_id || params.metadata.customer_id || "stripe"),
    metadata: params.metadata,
  });
}

async function upsertStripeCustomer(params: {
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

async function findSubscriptionByProviderId(serviceClient: SupabaseClient, providerSubscriptionId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await serviceClient
    .from("subscriptions")
    .select("id,user_id,tenant_id,plan_code,provider_customer_id")
    .eq("provider_subscription_id", providerSubscriptionId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as SubscriptionRow;
}

async function findSubscriptionByCustomerId(serviceClient: SupabaseClient, customerId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await serviceClient
    .from("subscriptions")
    .select("id,user_id,tenant_id,plan_code,provider_customer_id")
    .eq("provider_customer_id", customerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as SubscriptionRow;
}

async function resolveUserFromCustomerId(serviceClient: SupabaseClient, customerId: string): Promise<{ userId: string; tenantId: string | null } | null> {
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

  const fromSub = await findSubscriptionByCustomerId(serviceClient, customerId);
  if (fromSub) {
    return {
      userId: fromSub.user_id,
      tenantId: fromSub.tenant_id,
    };
  }

  return null;
}

async function ensureSubscriptionFromStripe(params: {
  serviceClient: SupabaseClient;
  stripeSubscription: Stripe.Subscription;
  stripeGrowthPriceId: string;
  stripePremiumPriceId: string;
}): Promise<SubscriptionRow | null> {
  const subscriptionId = params.stripeSubscription.id;
  const customerId =
    typeof params.stripeSubscription.customer === "string"
      ? params.stripeSubscription.customer
      : params.stripeSubscription.customer?.id || null;

  const existingBySubscription = await findSubscriptionByProviderId(params.serviceClient, subscriptionId);
  const existingByCustomer = customerId ? await findSubscriptionByCustomerId(params.serviceClient, customerId) : null;

  const metadataUserId = normalizeString(params.stripeSubscription.metadata?.user_id) || null;
  const metadataTenantId = normalizeString(params.stripeSubscription.metadata?.tenant_id) || null;
  const metadataPlanCode = normalizePlanCode(params.stripeSubscription.metadata?.plan_code);

  const mapping = customerId
    ? await resolveUserFromCustomerId(params.serviceClient, customerId)
    : null;

  const userId = existingBySubscription?.user_id
    || existingByCustomer?.user_id
    || mapping?.userId
    || metadataUserId;

  if (!userId) return null;

  let tenantId = existingBySubscription?.tenant_id
    || existingByCustomer?.tenant_id
    || mapping?.tenantId
    || metadataTenantId
    || null;

  if (!tenantId) {
    tenantId = await resolveTenantId(params.serviceClient, userId);
  }

  const firstPriceId = params.stripeSubscription.items?.data?.[0]?.price?.id || null;
  const mappedPlanCode = planCodeFromPriceId(
    firstPriceId,
    params.stripeGrowthPriceId,
    params.stripePremiumPriceId,
  );

  const planCode: PlanCode = mappedPlanCode
    || metadataPlanCode
    || existingBySubscription?.plan_code
    || existingByCustomer?.plan_code
    || "FREE";

  const status = mapStripeStatusToSubscriptionStatus(params.stripeSubscription.status);
  const currentPeriodEnd = toIsoFromUnix(params.stripeSubscription.current_period_end);

  if (customerId) {
    await upsertStripeCustomer({
      serviceClient: params.serviceClient,
      userId,
      tenantId,
      stripeCustomerId: customerId,
    });
  }

  const existingRow = existingBySubscription || existingByCustomer;

  if (existingRow) {
    const { data, error } = await params.serviceClient
      .from("subscriptions")
      .update({
        tenant_id: tenantId,
        plan_code: planCode,
        status,
        provider: "stripe",
        provider_customer_id: customerId,
        provider_subscription_id: subscriptionId,
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingRow.id)
      .select("id,user_id,tenant_id,plan_code,provider_customer_id")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Unable to update subscription from Stripe.");
    }

    return data as SubscriptionRow;
  }

  const { data, error } = await params.serviceClient
    .from("subscriptions")
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      plan_code: planCode,
      status,
      provider: "stripe",
      provider_customer_id: customerId,
      provider_subscription_id: subscriptionId,
      current_period_end: currentPeriodEnd,
    })
    .select("id,user_id,tenant_id,plan_code,provider_customer_id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to create subscription from Stripe.");
  }

  return data as SubscriptionRow;
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

async function insertStripeSubscriptionEvent(params: {
  serviceClient: SupabaseClient;
  subscriptionId: string;
  eventType: string;
  providerEventId: string;
  payload: Record<string, unknown>;
}) {
  const { error } = await params.serviceClient
    .from("subscription_events")
    .insert({
      subscription_id: params.subscriptionId,
      provider: "stripe",
      provider_event_id: params.providerEventId,
      event_type: params.eventType,
      payload: params.payload,
    });

  if (error && error.code !== "23505") {
    throw new Error(error.message || "Unable to insert Stripe subscription event.");
  }
}

async function updateInvoiceFields(params: {
  serviceClient: SupabaseClient;
  subscriptionId: string;
  invoiceStatus: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
  paymentFailed: boolean;
}) {
  const updates: Record<string, unknown> = {
    last_invoice_status: params.invoiceStatus,
    last_invoice_hosted_url: params.hostedUrl,
    last_invoice_pdf_url: params.pdfUrl,
    updated_at: new Date().toISOString(),
  };

  if (params.paymentFailed) {
    updates.status = "past_due";
  } else if (params.invoiceStatus === "paid") {
    updates.status = "active";
  }

  const { error } = await params.serviceClient
    .from("subscriptions")
    .update(updates)
    .eq("id", params.subscriptionId);

  if (error) {
    throw new Error(error.message || "Unable to update invoice state.");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method not allowed." });
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
  const stripeGrowthPriceId = Deno.env.get("STRIPE_PRICE_GROWTH") || "";
  const stripePremiumPriceId = Deno.env.get("STRIPE_PRICE_PREMIUM") || "";

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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

  try {
    if (await alreadyProcessedEvent(serviceClient, event.id)) {
      return json(200, { success: true, duplicate: true });
    }

    let subscriptionRow: SubscriptionRow | null = null;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const stripeSubscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id || null;

      if (stripeSubscriptionId) {
        const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        subscriptionRow = await ensureSubscriptionFromStripe({
          serviceClient,
          stripeSubscription,
          stripeGrowthPriceId,
          stripePremiumPriceId,
        });
      }

      if (subscriptionRow) {
        await insertStripeSubscriptionEvent({
          serviceClient,
          subscriptionId: subscriptionRow.id,
          eventType: event.type,
          providerEventId: event.id,
          payload: {
            checkout_session_id: session.id,
            stripe_subscription_id: stripeSubscriptionId,
            status: session.status,
            customer_email: session.customer_details?.email || null,
            amount_total: session.amount_total,
            currency: session.currency,
            raw: session,
          },
        });

        await writeAuditEvent({
          serviceClient,
          tenantId: subscriptionRow.tenant_id,
          userId: subscriptionRow.user_id,
          eventType: "stripe.checkout.completed",
          metadata: {
            subscription_id: subscriptionRow.id,
            provider_event_id: event.id,
          },
        });
      }
    } else if (
      event.type === "customer.subscription.created"
      || event.type === "customer.subscription.updated"
      || event.type === "customer.subscription.deleted"
    ) {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      subscriptionRow = await ensureSubscriptionFromStripe({
        serviceClient,
        stripeSubscription,
        stripeGrowthPriceId,
        stripePremiumPriceId,
      });

      if (subscriptionRow) {
        await insertStripeSubscriptionEvent({
          serviceClient,
          subscriptionId: subscriptionRow.id,
          eventType: event.type,
          providerEventId: event.id,
          payload: stripeSubscription as unknown as Record<string, unknown>,
        });

        await writeAuditEvent({
          serviceClient,
          tenantId: subscriptionRow.tenant_id,
          userId: subscriptionRow.user_id,
          eventType: `stripe.${event.type}`,
          metadata: {
            subscription_id: subscriptionRow.id,
            provider_event_id: event.id,
          },
        });
      }
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id || null;

      if (stripeSubscriptionId) {
        subscriptionRow = await findSubscriptionByProviderId(serviceClient, stripeSubscriptionId);

        if (!subscriptionRow) {
          const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          subscriptionRow = await ensureSubscriptionFromStripe({
            serviceClient,
            stripeSubscription,
            stripeGrowthPriceId,
            stripePremiumPriceId,
          });
        }
      }

      if (subscriptionRow) {
        const invoiceStatus = normalizeString(invoice.status) || (event.type === "invoice.paid" ? "paid" : "payment_failed");
        const hostedUrl = normalizeString(invoice.hosted_invoice_url) || null;
        const pdfUrl = normalizeString(invoice.invoice_pdf) || null;

        await updateInvoiceFields({
          serviceClient,
          subscriptionId: subscriptionRow.id,
          invoiceStatus,
          hostedUrl,
          pdfUrl,
          paymentFailed: event.type === "invoice.payment_failed",
        });

        await insertStripeSubscriptionEvent({
          serviceClient,
          subscriptionId: subscriptionRow.id,
          eventType: event.type,
          providerEventId: event.id,
          payload: {
            invoice_id: invoice.id,
            stripe_subscription_id: stripeSubscriptionId,
            status: invoiceStatus,
            hosted_invoice_url: hostedUrl,
            invoice_pdf: pdfUrl,
            amount_paid: invoice.amount_paid,
            amount_due: invoice.amount_due,
            currency: invoice.currency,
            raw: invoice,
          },
        });

        await writeAuditEvent({
          serviceClient,
          tenantId: subscriptionRow.tenant_id,
          userId: subscriptionRow.user_id,
          eventType: `stripe.${event.type}`,
          metadata: {
            subscription_id: subscriptionRow.id,
            provider_event_id: event.id,
            invoice_id: invoice.id,
          },
        });
      }
    }

    return json(200, { success: true, received: true, event_type: event.type });
  } catch (error) {
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Webhook processing failed.",
    });
  }
});
