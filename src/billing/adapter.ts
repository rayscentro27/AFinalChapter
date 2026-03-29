import { supabase } from '../../lib/supabaseClient';
import { PlanCode, SubscriptionEvent, SubscriptionRecord, SubscriptionStatus } from './types';

export interface BillingAdapter {
  getMembershipPlans(): Promise<Array<{ code: PlanCode; price_cents: number; is_active: boolean }>>;
  getCurrentSubscription(userId: string, tenantId: string | null): Promise<SubscriptionRecord | null>;
  listSubscriptionEvents(subscriptionId: string): Promise<SubscriptionEvent[]>;
  setSubscription(input: {
    userId: string;
    tenantId: string | null;
    planCode: PlanCode;
    status: SubscriptionStatus;
    provider?: 'manual' | 'stripe';
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
    eventType?: string;
    eventPayload?: Record<string, unknown>;
  }): Promise<SubscriptionRecord>;
}

function planCodeToTier(planCode: PlanCode): 'free' | 'growth' | 'premium' {
  return planCode.toLowerCase() as 'free' | 'growth' | 'premium';
}

class ManualBillingAdapter implements BillingAdapter {
  async getMembershipPlans() {
    const planRes = await supabase
      .from('subscription_plans')
      .select('tier,monthly_price_cents,is_active')
      .order('monthly_price_cents', { ascending: true });

    if (!planRes.error && Array.isArray(planRes.data) && planRes.data.length > 0) {
      return planRes.data.map((row) => ({
        code: String(row.tier || 'free').toUpperCase() as PlanCode,
        price_cents: Number(row.monthly_price_cents || 0),
        is_active: Boolean(row.is_active),
      }));
    }

    const legacyRes = await supabase
      .from('membership_plans')
      .select('code,price_cents,is_active')
      .order('price_cents', { ascending: true });

    if (legacyRes.error) throw new Error(legacyRes.error.message || 'Unable to load plans.');
    return (legacyRes.data || []) as Array<{ code: PlanCode; price_cents: number; is_active: boolean }>;
  }

  async getCurrentSubscription(userId: string, tenantId: string | null) {
    if (!tenantId) return null;

    const { data, error } = await supabase
      .from('subscriptions')
      .select('id,user_id,tenant_id,plan_code,tier,status,provider,provider_customer_id,provider_subscription_id,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end,created_at,updated_at')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message || 'Unable to load subscription.');
    return (data || null) as SubscriptionRecord | null;
  }

  async listSubscriptionEvents(subscriptionId: string) {
    const { data, error } = await supabase
      .from('subscription_events')
      .select('id,subscription_id,event_type,payload,created_at')
      .eq('subscription_id', subscriptionId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message || 'Unable to load subscription events.');
    return (data || []) as SubscriptionEvent[];
  }

  async setSubscription(input: {
    userId: string;
    tenantId: string | null;
    planCode: PlanCode;
    status: SubscriptionStatus;
    provider?: 'manual' | 'stripe';
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
    eventType?: string;
    eventPayload?: Record<string, unknown>;
  }) {
    const provider = input.provider || 'manual';
    const periodEnd = input.status === 'active' || input.status === 'trialing'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data: existing, error: existingError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', input.userId)
      .eq('tenant_id', input.tenantId)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message || 'Unable to resolve existing subscription.');
    }

    const subscriptionPayload = {
      plan_code: input.planCode,
      tier: planCodeToTier(input.planCode),
      status: input.status,
      provider,
      provider_customer_id: input.providerCustomerId || null,
      provider_subscription_id: input.providerSubscriptionId || null,
      stripe_customer_id: input.providerCustomerId || null,
      stripe_subscription_id: input.providerSubscriptionId || null,
      current_period_end: periodEnd,
      cancel_at_period_end: input.status === 'canceled',
      updated_at: new Date().toISOString(),
    };

    let subscription: SubscriptionRecord | null = null;

    if (existing?.id) {
      const { data, error } = await supabase
        .from('subscriptions')
        .update(subscriptionPayload)
        .eq('id', existing.id)
        .select('id,user_id,tenant_id,plan_code,tier,status,provider,provider_customer_id,provider_subscription_id,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end,created_at,updated_at')
        .single();

      if (error) throw new Error(error.message || 'Unable to update subscription.');
      subscription = data as SubscriptionRecord;
    } else {
      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          user_id: input.userId,
          tenant_id: input.tenantId,
          ...subscriptionPayload,
        })
        .select('id,user_id,tenant_id,plan_code,tier,status,provider,provider_customer_id,provider_subscription_id,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end,created_at,updated_at')
        .single();

      if (error) throw new Error(error.message || 'Unable to create subscription.');
      subscription = data as SubscriptionRecord;
    }

    const { error: eventError } = await supabase.from('subscription_events').insert({
      subscription_id: subscription.id,
      event_type: input.eventType || 'subscription.updated',
      payload: input.eventPayload || {
        plan_code: input.planCode,
        tier: planCodeToTier(input.planCode),
        status: input.status,
        provider,
      },
    });

    if (eventError) {
      throw new Error(eventError.message || 'Subscription event logging failed.');
    }

    return subscription;
  }
}

export const billingAdapter: BillingAdapter = new ManualBillingAdapter();
