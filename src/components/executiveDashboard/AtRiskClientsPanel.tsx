import React from 'react';
import type { DealEscalationItem } from '../../hooks/useExecutiveMetrics';
import { getPrimaryRiskSignal } from '../../utils/dealEscalationDrillthrough';

type Props = {
  items: DealEscalationItem[];
  title?: string;
  description?: string;
  onOpenDocuments?: (item: DealEscalationItem) => void;
  onOpenFunding?: (item: DealEscalationItem) => void;
  onOpenReviewQueue?: (item: DealEscalationItem) => void;
};

function levelClass(level: DealEscalationItem['escalation_level']) {
  if (level === 'escalated') return 'bg-rose-100 text-rose-700 border-rose-200';
  if (level === 'at_risk') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (level === 'watch') return 'bg-sky-100 text-sky-700 border-sky-200';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

function dollars(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value / 100);
}

export default function AtRiskClientsPanel({
  items,
  title = 'At-Risk / Escalated Clients',
  description = 'Which clients are slipping, why they are slipping, and what intervention should happen next.',
  onOpenDocuments,
  onOpenFunding,
  onOpenReviewQueue,
}: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Deal SLA</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No clients are currently flagged beyond healthy status in this snapshot.
          </div>
        ) : null}
        {items.map((item) => {
          const primaryRiskSignal = getPrimaryRiskSignal(item);

          return (
            <div key={item.tenant_id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{item.tenant_name}</h3>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${levelClass(item.escalation_level)}`}>
                      {item.escalation_level.replace('_', ' ')}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${primaryRiskSignal.toneClass}`}>
                      {primaryRiskSignal.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.current_stage} · stalled in {item.stalled_stage} · readiness {item.readiness_status.replace(/_/g, ' ')}
                  </p>
                </div>
                <div className="text-right text-sm text-slate-500">
                  <div>Client action gap: {item.days_since_client_action ?? 'n/a'}d</div>
                  <div>Funding step gap: {item.days_since_funding_step ?? 'n/a'}d</div>
                  <div>Approved capital: {dollars(item.approved_outcome_cents)}</div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Why At Risk</p>
                  <ul className="mt-2 space-y-2 text-sm text-slate-700">
                    {item.why_at_risk.map((reason) => (
                      <li key={reason} className="rounded-xl border border-slate-200 bg-white px-3 py-2">{reason}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Recommended Intervention</p>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">{item.recommended_intervention}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenDocuments?.(item)}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-700"
                    >
                      Open Documents
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenFunding?.(item)}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-700"
                    >
                      Open Funding
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenReviewQueue?.(item)}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-700"
                    >
                      Open Review Queue
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">Core overdue tasks: {item.overdue_credit_business_tasks + item.overdue_capital_tasks}</div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">Ignored conversations: {item.ignored_conversations}</div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">Optional flow lag: {item.overdue_optional_flow_tasks}</div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">Pending reviews: {item.pending_reviews}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}