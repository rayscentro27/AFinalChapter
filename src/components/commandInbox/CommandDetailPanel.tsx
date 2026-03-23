import React from 'react';
import type { CommandInboxDetail } from '../../hooks/useCommandInbox';
import CommandApprovalStatus from '../superAdminCommand/CommandApprovalStatus';
import CommandExecutionStatus from '../superAdminCommand/CommandExecutionStatus';
import CommandStatusBadge from '../superAdminCommand/CommandStatusBadge';

type Props = {
  detail: CommandInboxDetail | null;
};

export default function CommandDetailPanel({ detail }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Command Detail</p>
      {detail ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{detail.rawCommand}</div>
          <div className="flex flex-wrap gap-2">
            <CommandStatusBadge label={detail.parsedIntentLabel} />
            <CommandStatusBadge label={detail.validationStatus} />
            <CommandApprovalStatus approvalRequired={detail.approvalRequired} approvalStatus={detail.approvalStatus} />
          </div>
          <CommandExecutionStatus queueHandoffState={detail.queueHandoffState} executionOutcome={detail.executionOutcome} />
          {detail.executionSummary ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{detail.executionSummary}</div> : null}
          <div className="text-xs text-slate-500">Submitted: {detail.createdAt ? new Date(detail.createdAt).toLocaleString() : 'Unknown time'}</div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">Select a command to inspect the feedback loop.</div>
      )}
    </section>
  );
}