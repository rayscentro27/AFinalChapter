import React from 'react';
import CommandApprovalStatus from '../components/superAdminCommand/CommandApprovalStatus';
import CommandComposer from '../components/superAdminCommand/CommandComposer';
import CommandExecutionStatus from '../components/superAdminCommand/CommandExecutionStatus';
import CommandHistoryList from '../components/superAdminCommand/CommandHistoryList';
import ParsedIntentPreview from '../components/superAdminCommand/ParsedIntentPreview';
import CommandStatusBadge from '../components/superAdminCommand/CommandStatusBadge';
import { useSuperAdminCommandCenter } from '../hooks/useSuperAdminCommandCenter';

function openCommandInbox(commandId?: string) {
  const path = commandId ? `/admin/command-inbox?command_id=${encodeURIComponent(commandId)}` : '/admin/command-inbox';
  window.history.pushState({}, '', path);
  window.location.hash = 'admin_command_inbox';
}

export default function AdminSuperAdminCommandCenterPage() {
  const { user, checkingAccess, isAuthorized, loading, refreshing, submitting, error, submitError, history, draft, setDraft, selectedCommand, selectedCommandId, setSelectedCommandId, refresh, submitCommand, approveCommand, rejectCommand, cancelCommand } = useSuperAdminCommandCenter();

  const attentionRequired = history.filter((item) => item.status === 'requires_approval' || item.status === 'failed').slice(0, 6);
  const recentActivity = history.slice(0, 6);
  const executionMonitor = history.filter((item) => ['queued', 'executing', 'completed', 'failed', 'cancelled'].includes(item.status)).slice(0, 8);

  async function handleSubmitCommand() {
    const ok = await submitCommand();
    if (ok) {
      openCommandInbox();
    }
  }

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying command center access...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal command center access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal/admin users only.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#fffaf0_50%,#f8fafc_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Super Admin Command Center</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Plain-language AI workforce commands</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Submit natural-language instructions into the backend command system, then monitor validation and queue state without pretending the parser accepted anything it did not.</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700" onClick={() => openCommandInbox(selectedCommand?.id)}>Open Inbox</button>
            <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? 'Refreshing...' : 'Refresh History'}</button>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {submitError && !error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</div> : null}
      {loading && history.length === 0 ? <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Loading command center...</div> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <CommandComposer draft={draft} setDraft={setDraft} submitting={submitting} submitError={submitError} onSubmit={() => { void handleSubmitCommand(); }} />
          <ParsedIntentPreview intent={selectedCommand?.parsedIntent || null} />
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Selected Command Controls</p>
            {selectedCommand ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{selectedCommand.rawCommand}</div>
                <div className="flex flex-wrap gap-2">
                  <CommandStatusBadge label={`risk:${selectedCommand.riskLevel}`} />
                  <CommandStatusBadge label={selectedCommand.status} />
                  <CommandApprovalStatus approvalRequired={selectedCommand.approvalRequired} approvalStatus={selectedCommand.approvalStatus} />
                </div>
                <CommandExecutionStatus queueHandoffState={selectedCommand.queueHandoffState} executionOutcome={selectedCommand.executionOutcome} />
                {selectedCommand.resultSummary ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{selectedCommand.resultSummary}</div> : null}
                {selectedCommand.errorMessage ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{selectedCommand.errorMessage}</div> : null}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="Created" value={selectedCommand.createdAt ? new Date(selectedCommand.createdAt).toLocaleString() : 'Unknown'} />
                  <MetricCard label="Approved" value={selectedCommand.approvedAt ? new Date(selectedCommand.approvedAt).toLocaleString() : 'Not approved'} />
                  <MetricCard label="Executed" value={selectedCommand.executedAt ? new Date(selectedCommand.executedAt).toLocaleString() : 'Not executing'} />
                  <MetricCard label="Completed" value={selectedCommand.completedAt ? new Date(selectedCommand.completedAt).toLocaleString() : 'Not completed'} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={submitting || selectedCommand.status !== 'requires_approval'}
                    onClick={() => void approveCommand(selectedCommand.id)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={submitting || selectedCommand.status !== 'requires_approval'}
                    onClick={() => void rejectCommand(selectedCommand.id)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !['requires_approval', 'approved', 'queued'].includes(selectedCommand.status)}
                    onClick={() => void cancelCommand(selectedCommand.id)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700" onClick={() => openCommandInbox(selectedCommand.id)}>
                    Open In Inbox
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">Select a command to inspect approval and execution state.</div>
            )}
          </section>
        </div>
        <CommandHistoryList items={history} selectedCommandId={selectedCommandId} onSelect={setSelectedCommandId} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Attention Required</p>
          <div className="mt-4 space-y-3">
            {attentionRequired.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No commands currently need intervention.</div> : null}
            {attentionRequired.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedCommandId(item.id)} className="w-full rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-4 text-left">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item.rawCommand}</div>
                    <div className="mt-2 text-xs text-slate-600">{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Timestamp unavailable'}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CommandStatusBadge label={`risk:${item.riskLevel}`} />
                    <CommandStatusBadge label={item.status} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Recent Activity</p>
          <div className="mt-4 space-y-3">
            {recentActivity.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No recent command activity is visible yet.</div> : null}
            {recentActivity.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedCommandId(item.id)} className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:bg-white">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item.rawCommand}</div>
                    <div className="mt-2 text-xs text-slate-500">{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'Update unavailable'}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CommandStatusBadge label={item.status} />
                    <CommandStatusBadge label={`risk:${item.riskLevel}`} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Execution Monitor</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {executionMonitor.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500 xl:col-span-4">No queued or executed commands are visible yet.</div> : null}
          {executionMonitor.map((item) => (
            <button key={item.id} type="button" onClick={() => setSelectedCommandId(item.id)} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:bg-white">
              <div className="text-sm font-semibold text-slate-900">{item.rawCommand}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <CommandStatusBadge label={item.status} />
                <CommandStatusBadge label={`risk:${item.riskLevel}`} />
              </div>
              <div className="mt-3 text-xs text-slate-500">{item.resultSummary || item.executionSummary || 'No result summary yet.'}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
      <div className="font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 text-sm text-slate-900">{value}</div>
    </div>
  );
}