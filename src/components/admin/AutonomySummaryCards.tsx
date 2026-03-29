import React from 'react';
import { AutonomySummary } from '../../hooks/useAutonomyDashboard';

type Props = {
  summary: AutonomySummary;
};

const CARD_LABELS: Array<{ key: keyof AutonomySummary; label: string }> = [
  { key: 'events_processed', label: 'Events Processed' },
  { key: 'tasks_created', label: 'Tasks Created' },
  { key: 'messages_generated', label: 'Messages Generated' },
  { key: 'active_contexts', label: 'Active Contexts' },
  { key: 'handoffs_triggered', label: 'Handoffs' },
  { key: 'skipped_actions', label: 'Skipped Actions' },
  { key: 'failures', label: 'Failures' },
];

export default function AutonomySummaryCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7">
      {CARD_LABELS.map((card) => (
        <div key={card.key} className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-slate-100">
          <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">{card.label}</div>
          <div className="mt-2 text-2xl font-black">{summary[card.key]}</div>
        </div>
      ))}
    </div>
  );
}