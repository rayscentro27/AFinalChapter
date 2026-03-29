import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import UpgradeModal from '../../components/billing/UpgradeModal';
import RequiredDisclaimers from '../../components/legal/RequiredDisclaimers';
import { billingAdapter } from '../billing/adapter';
import { canAccessFeature } from '../billing/entitlements';
import { PlanCode, SubscriptionEvent, SubscriptionRecord } from '../billing/types';
import { createCheckoutSession, createPortalSession } from '../billing/stripeApi';
import { supabase } from '../../lib/supabaseClient';
import { resolveTenantIdForUser } from '../../utils/tenantContext';
import {
  COMMISSION_DISCLOSURE_VERSION,
  recordPaidUpgradeContractConsents,
} from '../billing/contractConsents';

type BillingPageProps = {
  selectedPlan?: PlanCode | null;
};

const PLAN_PRICE_CENTS: Record<PlanCode, number> = {
  FREE: 0,
  GROWTH: 5000,
  PREMIUM: 10000,
};

async function hashMarker(input: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((i) => i.toString(16).padStart(2, '0')).join('');
}

function tierToPlanCode(subscription: SubscriptionRecord | null): PlanCode {
  const tier = String(subscription?.tier || '').toLowerCase();
  if (tier === 'growth') return 'GROWTH';
  if (tier === 'premium') return 'PREMIUM';
  if (tier === 'free') return 'FREE';
  return (subscription?.plan_code || 'FREE') as PlanCode;
}

export default function BillingPage({ selectedPlan = null }: BillingPageProps) {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [events, setEvents] = useState<SubscriptionEvent[]>([]);
  const [plans, setPlans] = useState<Array<{ code: PlanCode; price_cents: number; is_active: boolean }>>([]);
  const [commissionDisclosureAccepted, setCommissionDisclosureAccepted] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [upgradePlan, setUpgradePlan] = useState<PlanCode | null>(selectedPlan);

  useEffect(() => {
    setUpgradePlan(selectedPlan || null);
  }, [selectedPlan]);

  async function refreshSubscriptionState(currentUserId: string, currentTenantId: string | null) {
    const [planRows, subRow] = await Promise.all([
      billingAdapter.getMembershipPlans(),
      billingAdapter.getCurrentSubscription(currentUserId, currentTenantId),
    ]);

    setPlans(planRows);
    setSubscription(subRow);

    if (subRow?.id) {
      const eventRows = await billingAdapter.listSubscriptionEvents(subRow.id);
      setEvents(eventRows);
    } else {
      setEvents([]);
    }

    const { data: disclosureRows } = await supabase
      .from('consents')
      .select('id')
      .eq('user_id', currentUserId)
      .eq('consent_type', 'commission_disclosure')
      .eq('version', COMMISSION_DISCLOSURE_VERSION)
      .order('accepted_at', { ascending: false })
      .limit(1);

    setCommissionDisclosureAccepted(Array.isArray(disclosureRows) && disclosureRows.length > 0);
  }

  useEffect(() => {
    let active = true;

    async function loadState() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const resolvedTenantId = await resolveTenantIdForUser(user.id);
        if (!active) return;

        setTenantId(resolvedTenantId);
        await refreshSubscriptionState(user.id, resolvedTenantId);
      } catch (e: any) {
        if (active) setError(String(e?.message || e));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadState();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const effectivePlan: PlanCode = tierToPlanCode(subscription);
  const effectiveStatus = subscription?.status || 'active';
  const renewalDateLabel = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : 'Not scheduled';

  const activePlans = useMemo(
    () => plans.filter((p) => p.is_active).sort((a, b) => a.price_cents - b.price_cents),
    [plans]
  );

  const fundingFeatureUnlocked = canAccessFeature({
    plan_code: effectivePlan,
    subscription_status: subscription?.status || 'active',
    commission_disclosure_accepted: commissionDisclosureAccepted,
  }, 'FUNDING_SEQUENCE');

  async function openStripePortal() {
    const portalUrl = await createPortalSession();
    window.location.assign(portalUrl);
  }

  async function confirmUpgrade() {
    if (!user?.id || !upgradePlan) return;

    setBusy(true);
    setError('');

    let redirecting = false;

    try {
      if (upgradePlan === 'FREE') {
        if (subscription?.provider === 'stripe' || subscription?.stripe_customer_id || subscription?.provider_customer_id) {
          redirecting = true;
          await openStripePortal();
          return;
        }

        await billingAdapter.setSubscription({
          userId: user.id,
          tenantId,
          planCode: 'FREE',
          status: 'active',
          provider: 'manual',
          eventType: 'subscription.downgraded',
          eventPayload: {
            source: 'billing_page_free_selection',
            plan_code: 'FREE',
          },
        });

        await refreshSubscriptionState(user.id, tenantId);
        setUpgradePlan(null);
        return;
      }

      const contractMeta = await recordPaidUpgradeContractConsents({
        userId: user.id,
        tenantId,
      });

      const checkoutUrl = await createCheckoutSession(upgradePlan);

      await supabase.from('audit_events').insert({
        tenant_id: tenantId,
        actor_user_id: user.id,
        event_type: 'stripe.checkout.redirect',
        metadata: {
          plan_code: upgradePlan,
          membership_agreement_version: contractMeta.membershipAgreementVersion,
          refund_policy_version: contractMeta.refundPolicyVersion,
          accepted_at: contractMeta.acceptedAt,
        },
      });

      redirecting = true;
      window.location.assign(checkoutUrl);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      if (!redirecting) {
        setBusy(false);
      }
    }
  }

  async function cancelCurrentSubscription() {
    if (!user?.id || !subscription) return;

    setBusy(true);
    setError('');
    try {
      if (subscription.provider === 'stripe' || subscription.stripe_customer_id || subscription.provider_customer_id) {
        await openStripePortal();
        return;
      }

      await billingAdapter.setSubscription({
        userId: user.id,
        tenantId,
        planCode: effectivePlan,
        status: 'canceled',
        provider: subscription.provider || 'manual',
        providerCustomerId: subscription.provider_customer_id,
        providerSubscriptionId: subscription.provider_subscription_id,
        eventType: 'subscription.canceled',
        eventPayload: {
          source: 'billing_page_manual_cancel',
          plan_code: effectivePlan,
        },
      });

      await refreshSubscriptionState(user.id, tenantId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function acceptCommissionDisclosure() {
    if (!user?.id) return;

    setBusy(true);
    setError('');

    try {
      const now = new Date().toISOString();
      const userAgent = navigator.userAgent || 'unknown';
      const ipHash = await hashMarker(`${user.id}:${now}:commission_disclosure`);

      const { error: disclosureError } = await supabase.from('commission_disclosures').insert({
        user_id: user.id,
        tenant_id: tenantId,
        version: COMMISSION_DISCLOSURE_VERSION,
        accepted_at: now,
        ip_hash: ipHash,
        user_agent: userAgent,
        notes: 'Accepted in BillingPage premium funding enablement.',
      });

      if (disclosureError) {
        throw new Error(disclosureError.message || 'Unable to write commission disclosure record.');
      }

      const { error: consentError } = await supabase.from('consents').upsert({
        user_id: user.id,
        tenant_id: tenantId,
        consent_type: 'commission_disclosure',
        version: COMMISSION_DISCLOSURE_VERSION,
        accepted_at: now,
        ip_hash: ipHash,
        user_agent: userAgent,
      }, {
        onConflict: 'user_id,consent_type,version',
      });

      if (consentError) {
        throw new Error(consentError.message || 'Unable to save commission disclosure consent.');
      }

      const { error: auditError } = await supabase.from('audit_events').insert({
        tenant_id: tenantId,
        actor_user_id: user.id,
        event_type: 'commission_disclosure.accepted',
        metadata: {
          version: COMMISSION_DISCLOSURE_VERSION,
          accepted_at: now,
          notes: '10% commission disclosure for supported funding workflow only.',
        },
      });

      if (auditError) {
        throw new Error(auditError.message || 'Unable to log commission disclosure audit event.');
      }

      setCommissionDisclosureAccepted(true);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Sign in required for billing access.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading billing contract...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 text-slate-100 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Billing</h1>
        <p className="text-sm text-slate-400 mt-2">
          Tier: <span className="text-cyan-300 font-bold">{effectivePlan}</span> ({effectiveStatus}).
          Renewal: <span className="text-cyan-300 font-bold"> {renewalDateLabel}</span>.
        </p>
      </div>

      <RequiredDisclaimers title="Educational Tools and No-Guarantee Positioning" />

      {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div> : null}

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 flex flex-col gap-3">
        <h2 className="text-lg font-bold text-white">Manage Subscription</h2>
        <p className="text-sm text-slate-300">
          Paid memberships auto-renew monthly until canceled. Use Stripe Portal to cancel, update payment method,
          and manage billing details.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy || !subscription || !(subscription.provider === 'stripe' || subscription.stripe_customer_id || subscription.provider_customer_id)}
            onClick={() => void openStripePortal()}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
          >
            Manage in Stripe Portal
          </button>
          <button
            disabled={busy || !subscription || subscription.status === 'canceled'}
            onClick={() => void cancelCurrentSubscription()}
            className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-200 disabled:opacity-50"
          >
            {subscription?.status === 'canceled' ? 'Already Canceled' : 'Cancel Subscription'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {activePlans.map((plan) => {
          const isCurrent = plan.code === effectivePlan;
          return (
            <div key={plan.code} className={`rounded-2xl border p-5 ${isCurrent ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-slate-900'}`}>
              <p className="text-xs tracking-widest uppercase font-black text-cyan-300">{plan.code}</p>
              <p className="mt-2 text-3xl font-black text-white">${Math.round(plan.price_cents / 100)}<span className="text-xs text-slate-400">/mo</span></p>
              <p className="mt-2 text-xs text-slate-400">Educational templates and workflow tools. Results vary. No guaranteed outcomes.</p>
              <button
                disabled={busy || isCurrent}
                className="mt-4 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
                onClick={() => setUpgradePlan(plan.code)}
              >
                {isCurrent ? 'Current Plan' : 'Choose Plan'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-3">
        <h2 className="text-lg font-bold text-white">Premium Funding Assistance Gate</h2>
        <p className="text-sm text-slate-300">
          Commission disclosure acceptance is required before premium funding assistance features unlock.
          Commission disclosure: 10% on funding secured through supported workflow.
        </p>
        <p className="text-sm text-slate-300">
          We provide educational templates and workflow support only. Users submit their own applications.
        </p>
        <div className="text-sm">
          Funding feature status:{' '}
          <span className={fundingFeatureUnlocked ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'}>
            {fundingFeatureUnlocked ? 'Unlocked' : 'Locked'}
          </span>
        </div>
        <button
          disabled={busy || commissionDisclosureAccepted || effectivePlan !== 'PREMIUM'}
          onClick={() => void acceptCommissionDisclosure()}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
        >
          {commissionDisclosureAccepted ? 'Commission Disclosure Accepted' : 'Accept Commission Disclosure'}
        </button>
        {effectivePlan !== 'PREMIUM' ? (
          <p className="text-xs text-slate-500">Upgrade to PREMIUM first to enable funding assistance features.</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-lg font-bold text-white mb-3">Subscription Events</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">No subscription events recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 text-xs">
                <p className="font-semibold text-cyan-300">{event.event_type}</p>
                <p className="text-slate-300 mt-1">{new Date(event.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <UpgradeModal
        open={Boolean(upgradePlan)}
        loading={busy}
        targetPlan={upgradePlan}
        targetPriceCents={upgradePlan ? PLAN_PRICE_CENTS[upgradePlan] : 0}
        error={error || null}
        onClose={() => setUpgradePlan(null)}
        onConfirm={confirmUpgrade}
      />
    </div>
  );
}
