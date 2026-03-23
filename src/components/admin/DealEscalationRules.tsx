import React from 'react';
import type { DealEscalationRule } from '../../hooks/useExecutiveMetrics';

type Props = {
  rules: DealEscalationRule[];
};

export default function DealEscalationRules({ rules }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Escalation Rules</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-900">How the SLA engine classifies risk</h2>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {rules.map((rule) => (
          <div key={rule.key} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-semibold text-slate-900">{rule.label}</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2"><strong className="text-slate-900">Watch:</strong> {rule.watch_threshold}</div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2"><strong className="text-slate-900">Escalated:</strong> {rule.escalated_threshold}</div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"><strong className="text-slate-900">Intervention:</strong> {rule.intervention}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}