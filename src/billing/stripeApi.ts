import { supabase } from '../../lib/supabaseClient';
import { PlanCode } from './types';

type StripeSessionResponse = {
  success?: boolean;
  url?: string;
  error?: string;
};

async function invokeStripeBilling(action: 'create-checkout-session' | 'create-portal-session', body: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('stripe-billing', {
    body: {
      action,
      ...body,
    },
  });

  if (error) {
    throw new Error(error.message || 'Stripe billing function call failed.');
  }

  const payload = (data || {}) as StripeSessionResponse;
  if (!payload.success || !payload.url) {
    throw new Error(payload.error || 'Stripe billing function returned no redirect URL.');
  }

  return payload.url;
}

export async function createCheckoutSession(planCode: PlanCode) {
  if (planCode !== 'GROWTH' && planCode !== 'PREMIUM') {
    throw new Error('Only GROWTH and PREMIUM plans can use Stripe checkout.');
  }

  return invokeStripeBilling('create-checkout-session', {
    plan_code: planCode,
  });
}

export async function createPortalSession() {
  return invokeStripeBilling('create-portal-session');
}
