import React from 'react';
import { FailureItem, HandoffLogItem, SkippedActionItem } from '../../hooks/useAutonomyDashboard';

type Props = {
  handoffs: HandoffLogItem[];
  skippedActions: SkippedActionItem[];
  failures: FailureItem[];
};

function SectionShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900 overflow-hidden">
      <div className="border-b border-white/10 px-6 py-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">{title}</h2>
        <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function AutonomyLogPanels({ handoffs, skippedActions, failures }: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <SectionShell title="Handoff Log" subtitle="Which agents triggered others">
        <div className="space-y-3">
          {handoffs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">No handoffs recorded.</div>
          ) : handoffs.map((row) => (
            <article key={row.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-100">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{row.from_agent} {'->'} {row.to_agent}</span>
                <span className="text-[10px] uppercase tracking-widest text-slate-400">{row.message_type}</span>
              </div>
              <p className="mt-2 text-slate-300">{row.content_preview || 'No content preview.'}</p>
              <div className="mt-3 text-xs text-slate-500">{new Date(row.created_at).toLocaleString()}</div>
            </article>
          ))}
        </div>
      </SectionShell>

      <SectionShell title="Skipped Actions" subtitle="Cooldowns and duplicates">
        <div className="space-y-3">
          {skippedActions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">No skipped actions in this window.</div>
          ) : skippedActions.map((row) => (
            <article key={row.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-100">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{row.agent_name}</span>
                <span className="text-[10px] uppercase tracking-widest text-amber-300">{row.action_taken}</span>
              </div>
              <p className="mt-2 text-slate-300">{row.reason}</p>
              <div className="mt-3 text-xs text-slate-500">{new Date(row.created_at).toLocaleString()}</div>
            </article>
          ))}
        </div>
      </SectionShell>

      <SectionShell title="Failures" subtitle="Errors and failed decisions">
        <div className="space-y-3">
          {failures.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">No failures recorded in this window.</div>
          ) : failures.map((row) => (
            <article key={row.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-100">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{row.actor}</span>
                <span className="text-[10px] uppercase tracking-widest text-red-300">{row.source}</span>
              </div>
              <div className="mt-2 text-slate-300">{row.type}</div>
              <div className="mt-1 text-red-200">{row.reason}</div>
              <div className="mt-3 text-xs text-slate-500">{new Date(row.created_at).toLocaleString()}</div>
            </article>
          ))}
        </div>
      </SectionShell>
    </div>
  );
}