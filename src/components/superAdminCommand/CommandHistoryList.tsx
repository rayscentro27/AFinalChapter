import React from 'react';
import type { AdminCommandRecord } from '../../hooks/useSuperAdminCommandCenter';
import CommandApprovalStatus from './CommandApprovalStatus';
import CommandExecutionStatus from './CommandExecutionStatus';
import CommandStatusBadge from './CommandStatusBadge';

type Props = {
  items: AdminCommandRecord[];
  selectedCommandId: string;
  onSelect: (commandId: string) => void;
};

export default function CommandHistoryList({ items, selectedCommandId, onSelect }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Command History</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No commands have been returned yet.</div> : null}
        {items.map((item) => {
          const isActive = item.id === selectedCommandId;
          return (
            <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={`w-full rounded-[1.5rem] border px-4 py-4 text-left transition ${isActive ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-900 hover:bg-white'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{item.rawCommand}</div>
                  <div className={`mt-2 text-xs ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Timestamp unavailable'}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CommandStatusBadge label={item.commandType} />
                  <CommandStatusBadge label={`risk:${item.riskLevel}`} />
                  <CommandStatusBadge label={item.status} />
                  <CommandStatusBadge label={item.validationStatus} />
                  <CommandApprovalStatus approvalRequired={item.approvalRequired} approvalStatus={item.approvalStatus} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <CommandExecutionStatus queueHandoffState={item.queueHandoffState} executionOutcome={item.executionOutcome} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}