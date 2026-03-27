import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import RequiredDisclaimers from '../../components/legal/RequiredDisclaimers';
import { billingAdapter } from '../billing/adapter';
import { PlanCode } from '../billing/types';

type PricingPageProps = {
  onNavigateBilling?: (plan?: PlanCode) => void;
};

const FALLBACK_PLANS: Array<{ code: PlanCode; price_cents: number; is_active: boolean }> = [
  { code: 'FREE', price_cents: 0, is_active: true },
  { code: 'GROWTH', price_cents: 9700, is_active: true },
  { code: 'PREMIUM', price_cents: 19700, is_active: true },
];

export default function PricingPage({ onNavigateBilling }: PricingPageProps) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Array<{ code: PlanCode; price_cents: number; is_active: boolean }>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadPlans() {
      setError('');
      try {
        const data = await billingAdapter.getMembershipPlans();
        if (!active) return;
        setPlans(data.filter((item) => item.is_active));
      } catch (e: any) {
        if (!active) return;
        setError(String(e?.message || e));
      }
    }

    void loadPlans();
    return () => {
      active = false;
    };
  }, []);

  const visiblePlans = plans.length > 0 ? plans : FALLBACK_PLANS;
  const sorted = [...visiblePlans].sort((a, b) => a.price_cents - b.price_cents);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 text-slate-800">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Pricing</h1>
        <p className="mt-2 text-sm text-slate-600">
          Educational workflow tools and templates. No guaranteed credit, funding, grant, or investment outcomes.
        </p>
      </div>

      <RequiredDisclaimers title="No Guarantees and Educational Positioning" />

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sorted.map((plan) => (
          <div key={plan.code} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-black uppercase tracking-widest text-blue-600">{plan.code}</p>
            <p className="mt-3 text-4xl font-black text-slate-900">
              ${Math.round(plan.price_cents / 100)}
              <span className="text-xs font-semibold text-slate-500">/mo</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>Educational templates and guided workflows</li>
              <li>Results vary by user and third-party decisions</li>
              <li>No performance guarantees</li>
            </ul>
            <button
              className="mt-5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-blue-700"
              onClick={() => {
                if (!user) {
                  window.location.hash = 'signup';
                  return;
                }

                onNavigateBilling?.(plan.code);
              }}
            >
              {user ? 'Open Billing' : 'Create Account'}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        Paid tier activation requires acceptance of the <a href="/membership-agreement" className="text-blue-600 hover:text-blue-700">Membership Agreement</a>
        {' '}and <a href="/refund-policy" className="text-blue-600 hover:text-blue-700">Refund Policy</a> before checkout.
      </p>
    </div>
  );
}
