import React from 'react';
import { AgentContextItem, AutonomySummary } from '../../hooks/useAutonomyDashboard';

type Props = {
  summary: AutonomySummary;
  contexts: AgentContextItem[];
  hours: number;
};

type AlertItem = {
  level: 'warning' | 'critical';
  title: string;
  body: string;
};

function hoursSince(timestamp: string): number {
  const ms = Date.now() - new Date(timestamp).getTime();
  return ms / (1000 * 60 * 60);
}

export default function AutonomyAlertStrip({ summary, contexts, hours }: Props) {
  const alerts: AlertItem[] = [];
  const failureRate = summary.events_processed > 0 ? summary.failures / Math.max(summary.events_processed, 1) : 0;
  const skipRate = summary.active_agents > 0 ? summary.skipped_actions / Math.max(summary.tasks_created + summary.skipped_actions, 1) : 0;
  const staleContexts = contexts.filter((context) => hoursSince(context.updated_at) > Math.max(6, hours / 4));

  if (failureRate >= 0.25 || summary.failures >= 10) {
    alerts.push({
      level: 'critical',
      title: 'Failure Rate Elevated',
      body: `${summary.failures} failures detected in the selected window. Investigate agent actions and system events before throughput degrades further.`,
    });
  }
  if (skipRate >= 0.4 && summary.skipped_actions >= 5) {
    alerts.push({
      level: 'warning',
      title: 'Suppression Volume High',
      body: `${summary.skipped_actions} actions were skipped or suppressed. Cooldown or duplicate rules may be overfiring.`,
    });
  }
  if (staleContexts.length > 0) {
    alerts.push({
      level: staleContexts.length >= 3 ? 'critical' : 'warning',
      title: 'Stale Agent Contexts',
      body: `${staleContexts.length} client contexts have not updated recently. Review stuck handoffs or blocked stages.`,
    });
  }

  if (alerts.length === 0) return null;

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900 p-4">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {alerts.map((alert) => (
          <article
            key={`${alert.level}:${alert.title}`}
            className={alert.level === 'critical'
              ? 'rounded-2xl border border-red-500/30 bg-red-500/10 p-4'
              : 'rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4'}
          >
            <div className={alert.level === 'critical' ? 'text-[11px] font-black uppercase tracking-widest text-red-200' : 'text-[11px] font-black uppercase tracking-widest text-amber-200'}>
              {alert.title}
            </div>
            <p className="mt-2 text-sm text-slate-100">{alert.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}