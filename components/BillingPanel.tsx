import React from 'react';
import { CreditCard, BarChart3, DollarSign } from 'lucide-react';

const BillingPanel: React.FC = () => {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-black text-blue-900 mb-6 flex items-center gap-2">
        <CreditCard className="text-blue-600" /> Billing
      </h1>
      <div className="rounded-2xl bg-white p-6 shadow border border-slate-200 mb-8">
        <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><BarChart3 /> Plans & Pricing</h2>
        <ul className="text-slate-700 text-sm list-disc ml-5">
          <li>Starter: $49/mo</li>
          <li>Growth: $149/mo</li>
          <li>Enterprise: Custom</li>
        </ul>
        <p className="text-xs text-slate-500 mt-2">Plan names, pricing, and upgrade messaging are centralized here for landing page and app use.</p>
      </div>
      <div className="rounded-2xl bg-white p-6 shadow border border-slate-200 mb-8">
        <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><DollarSign /> Usage & Revenue Rules</h2>
        <ul className="text-slate-700 text-sm list-disc ml-5">
          <li>Usage: 1200 API calls this month</li>
          <li>Commission: 2% on funded deals</li>
          <li>Feature unlocks: Growth/Enterprise only</li>
        </ul>
      </div>
      <div className="rounded-2xl bg-white p-6 shadow border border-slate-200">
        <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">Commissions</h2>
        <ul className="text-slate-700 text-sm list-disc ml-5">
          <li>Commission disclosures and unlock rules are shown here</li>
        </ul>
      </div>
    </div>
  );
};

export default BillingPanel;
