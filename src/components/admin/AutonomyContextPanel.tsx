import React from 'react';
import { AgentContextItem } from '../../hooks/useAutonomyDashboard';

type Props = {
  contexts: AgentContextItem[];
};

function tone(status: string) {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'running', 'ready'].includes(normalized)) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (['paused', 'cooldown', 'waiting'].includes(normalized)) return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (['inactive', 'disabled', 'failed', 'error'].includes(normalized)) return 'border-red-500/30 bg-red-500/10 text-red-200';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-200';
}

export default function AutonomyContextPanel({ contexts }: Props) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Current Agent Context</h2>
          <p className="mt-1 text-xs text-slate-400">Live client-stage context records from the autonomy layer.</p>
        </div>
        <span className="text-xs text-slate-400">{contexts.length} contexts</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {contexts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-400 xl:col-span-2">
            No agent context records available for this selection.
          </div>
        ) : contexts.map((context) => (
          <article key={context.id} className="rounded-2xl border border-white/10 bg-black/20 p-5 text-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black tracking-tight">{context.client_id || 'Unknown Client'}</h3>
                <p className="mt-1 text-xs uppercase tracking-widest text-slate-400">Stage: {context.active_stage}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${tone(context.status)}`}>
                {context.status}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">Owner: <span className="font-semibold">{context.owner_agent || 'unassigned'}</span></div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">Recent events: <span className="font-semibold">{context.recent_event_count}</span></div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">Actions tracked: <span className="font-semibold">{context.action_count}</span></div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">Cooldown keys: <span className="font-semibold">{context.cooldown_count}</span></div>
            </div>

            <div className="mt-4 text-xs text-slate-400">Updated {new Date(context.updated_at).toLocaleString()}</div>
          </article>
        ))}
      </div>
    </section>
  );
}