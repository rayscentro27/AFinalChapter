import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@14.25.0";

type PlanCode = "GROWTH" | "PREMIUM";
type RouteKey = "checkout" | "portal";

type TenantMembershipRow = { tenant_id: string };
type StripeCustomerRow = { stripe_customer_id: string; tenant_id: string | null };

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const PLAN_PRICE_ENV: Record<PlanCode, string> = {
  GROWTH: "STRIPE_PRICE_GROWTH",
  PREMIUM: "STRIPE_PRICE_PREMIUM",
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

function resolveRoute(pathname: string, action: string): RouteKey | null {
  const path = pathname.replace(/\/+$/, "");

  if (path.endsWith("/create-checkout-session")) return "checkout";
  if (path.endsWith("/create-portal-session")) return "portal";

  if (action === "create-checkout-session") return "checkout";
  if (action === "create-portal-session") return "portal";

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
    return String((preferred.data as TenantMembershipRow).tenant_id);
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
  userId: string;
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
    entity_id: params.userId,
    metadata: params.metadata,
  });
}

async function lookupExistingCustomerId(serviceClient: SupabaseClient, userId: string): Promise<string | null> {
  const mapped = await serviceClient
    .from("stripe_customers")
    .select("stripe_customer_id,tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!mapped.error && mapped.data?.stripe_customer_id) {
    return String((mapped.data as StripeCustomerRow).stripe_customer_id);
  }

  const fromSubscription = await serviceClient
    .from("subscriptions")
    .select("provider_customer_id")
    .eq("user_id", userId)
    .not("provider_customer_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!fromSubscription.error && fromSubscription.data?.provider_customer_id) {
    return String(fromSubscription.data.provider_customer_id);
  }

  return null;
}

async function resolveOrCreateStripeCustomer(params: {
  stripe: Stripe;
  serviceClient: SupabaseClient;
  userId: string;
  tenantId: string | null;
  email: string | null;
  fullName: string | null;
}): Promise<string> {
  let customerId = await lookupExistingCustomerId(params.serviceClient, params.userId);

  if (!customerId) {
    const customer = await params.stripe.customers.create({
      email: params.email || undefined,
      name: params.fullName || undefined,
      metadata: {
        user_id: params.userId,
        tenant_id: params.tenantId || "",
      },
    });

    customerId = customer.id;
  }

  const { error } = await params.serviceClient
    .from("stripe_customers")
    .upsert(
      {
        user_id: params.userId,
        tenant_id: params.tenantId,
        stripe_customer_id: customerId,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw new Error(error.message || "Unable to persist Stripe customer mapping.");
  }

  return customerId;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method not allowed." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const successUrl = Deno.env.get("STRIPE_SUCCESS_URL") || "";
  const cancelUrl = Deno.env.get("STRIPE_CANCEL_URL") || "";

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(500, { success: false, error: "Supabase environment is not configured." });
  }

  if (!stripeSecretKey || !successUrl || !cancelUrl) {
    return json(500, { success: false, error: "Stripe environment is not configured." });
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }

  const route = resolveRoute(new URL(req.url).pathname, normalizeString(body.action));
  if (!route) {
    return json(404, { success: false, error: "Route not found." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { success: false, error: "Missing bearer token." });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const auth = await userClient.auth.getUser();
  if (auth.error || !auth.data.user) {
    return json(401, { success: false, error: "Unauthorized." });
  }

  const user = auth.data.user;
  const tenantId = await resolveTenantId(serviceClient, user.id);

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
  });

  try {
    if (route === "checkout") {
      const planCode = normalizeString(body.plan_code).toUpperCase() as PlanCode;
      if (planCode !== "GROWTH" && planCode !== "PREMIUM") {
        return json(400, { success: false, error: "plan_code must be GROWTH or PREMIUM." });
      }

      const priceEnv = PLAN_PRICE_ENV[planCode];
      const priceId = Deno.env.get(priceEnv) || "";

      if (!priceId) {
        return json(500, { success: false, error: `${priceEnv} is not configured.` });
      }

      const customerId = await resolveOrCreateStripeCustomer({
        stripe,
        serviceClient,
        userId: user.id,
        tenantId,
        email: user.email || null,
        fullName: normalizeString(user.user_metadata?.name) || null,
      });

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        metadata: {
          user_id: user.id,
          tenant_id: tenantId || "",
          plan_code: planCode,
        },
        subscription_data: {
          metadata: {
            user_id: user.id,
            tenant_id: tenantId || "",
            plan_code: planCode,
          },
        },
      });

      await writeAuditEvent({
        serviceClient,
        tenantId,
        userId: user.id,
        eventType: "stripe.checkout_session.created",
        metadata: {
          plan_code: planCode,
          checkout_session_id: session.id,
        },
      });

      return json(200, {
        success: true,
        plan_code: planCode,
        session_id: session.id,
        url: session.url,
      });
    }

    const existingCustomerId = await lookupExistingCustomerId(serviceClient, user.id);
    if (!existingCustomerId) {
      return json(400, { success: false, error: "No Stripe customer found. Start a subscription first." });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: existingCustomerId,
      return_url: successUrl,
    });

    await writeAuditEvent({
      serviceClient,
      tenantId,
      userId: user.id,
      eventType: "stripe.portal_session.created",
      metadata: {
        stripe_customer_id: existingCustomerId,
      },
    });

    return json(200, {
      success: true,
      url: portal.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected Stripe billing error.";
    return json(500, { success: false, error: message });
  }
});
