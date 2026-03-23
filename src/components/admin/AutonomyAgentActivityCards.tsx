import React from 'react';
import { AgentActivity } from '../../hooks/useAutonomyDashboard';

type Props = {
  agents: AgentActivity[];
};

export default function AutonomyAgentActivityCards({ agents }: Props) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Agent Activity</h2>
        <span className="text-xs text-slate-400">Actions per agent</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {agents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-400 lg:col-span-3">
            No agent action history recorded in this window.
          </div>
        ) : agents.map((agent) => (
          <article key={agent.agent_name} className="rounded-2xl border border-white/10 bg-black/20 p-5 text-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black tracking-tight">{agent.agent_name}</h3>
                <p className="mt-1 text-xs uppercase tracking-widest text-slate-400">Top action: {agent.top_action}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-right">
                <div className="text-[10px] uppercase tracking-widest text-slate-500">Total</div>
                <div className="text-xl font-black">{agent.total_actions}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">Tasks created: <span className="font-semibold text-slate-100">{agent.tasks_created}</span></div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">Handoffs: <span className="font-semibold text-slate-100">{agent.handoffs_triggered}</span></div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">Skipped: <span className="font-semibold text-amber-200">{agent.skipped_actions}</span></div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">Failures: <span className="font-semibold text-red-200">{agent.failures}</span></div>
            </div>

            <div className="mt-4 text-xs text-slate-400">
              Last action: {agent.last_action_at ? new Date(agent.last_action_at).toLocaleString() : 'n/a'}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}