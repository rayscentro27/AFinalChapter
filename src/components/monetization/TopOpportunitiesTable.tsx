import React from 'react';
import CommandStatusBadge from '../superAdminCommand/CommandStatusBadge';
import type { MonetizationOpportunity } from '../../hooks/useMonetizationOpportunities';

type Props = {
  items: MonetizationOpportunity[];
  onOpenOpportunity: (item: MonetizationOpportunity) => void;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
}

export default function TopOpportunitiesTable({ items, onOpenOpportunity }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Top Opportunities</p>
      <div className="mt-4 overflow-x-auto">
        {items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No monetization opportunities are available yet.</div> : null}
        {items.length > 0 ? (
          <table className="min-w-full text-sm text-slate-700">
            <thead className="text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              <tr>
                <th className="py-3 pr-4">Opportunity</th>
                <th className="py-3 pr-4">Domain</th>
                <th className="py-3 pr-4">Estimated Value</th>
                <th className="py-3 pr-4">Confidence</th>
                <th className="py-3 pr-4">Source</th>
                <th className="py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 align-top">
                  <td className="py-4 pr-4">
                    <div className="font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.summary || item.opportunityType}</div>
                  </td>
                  <td className="py-4 pr-4">{item.domain}</td>
                  <td className="py-4 pr-4 font-semibold text-slate-900">{formatCurrency(item.estimatedValue)}</td>
                  <td className="py-4 pr-4"><CommandStatusBadge label={item.confidence} /></td>
                  <td className="py-4 pr-4"><CommandStatusBadge label={item.sourceLabel} /></td>
                  <td className="py-4">
                    <button
                      type="button"
                      onClick={() => onOpenOpportunity(item)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 hover:bg-slate-50"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}