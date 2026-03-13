import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import RequiredDisclaimers from '../../components/legal/RequiredDisclaimers';
import { billingAdapter } from '../billing/adapter';
import { PlanCode } from '../billing/types';

type PricingPageProps = {
  onNavigateBilling?: (plan?: PlanCode) => void;
};

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

  const sorted = [...plans].sort((a, b) => a.price_cents - b.price_cents);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 text-slate-100 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Pricing</h1>
        <p className="text-sm text-slate-400 mt-2">
          Educational workflow tools and templates. No guaranteed credit, funding, grant, or investment outcomes.
        </p>
      </div>

      <RequiredDisclaimers title="No Guarantees and Educational Positioning" />

      {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sorted.map((plan) => (
          <div key={plan.code} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 flex flex-col">
            <p className="text-xs tracking-widest uppercase text-cyan-300 font-black">{plan.code}</p>
            <p className="mt-3 text-4xl font-black text-white">
              ${Math.round(plan.price_cents / 100)}
              <span className="text-xs text-slate-400 font-semibold">/mo</span>
            </p>
            <ul className="mt-4 text-sm text-slate-300 space-y-2">
              <li>Educational templates and guided workflows</li>
              <li>Results vary by user and third-party decisions</li>
              <li>No performance guarantees</li>
            </ul>
            <button
              className="mt-5 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950"
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
        Paid tier activation requires acceptance of the <a href="/membership-agreement" className="text-cyan-300 hover:text-cyan-200">Membership Agreement</a>
        {' '}and <a href="/refund-policy" className="text-cyan-300 hover:text-cyan-200">Refund Policy</a> before checkout.
      </p>
    </div>
  );
}
