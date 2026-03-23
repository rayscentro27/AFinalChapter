import React from 'react';
import CommandApprovalStatus from '../components/superAdminCommand/CommandApprovalStatus';
import CommandComposer from '../components/superAdminCommand/CommandComposer';
import CommandExecutionStatus from '../components/superAdminCommand/CommandExecutionStatus';
import CommandHistoryList from '../components/superAdminCommand/CommandHistoryList';
import ParsedIntentPreview from '../components/superAdminCommand/ParsedIntentPreview';
import { useSuperAdminCommandCenter } from '../hooks/useSuperAdminCommandCenter';

function openCommandInbox(commandId?: string) {
  const path = commandId ? `/admin/command-inbox?command_id=${encodeURIComponent(commandId)}` : '/admin/command-inbox';
  window.history.pushState({}, '', path);
  window.location.hash = 'admin_command_inbox';
}

export default function AdminSuperAdminCommandCenterPage() {
  const { user, checkingAccess, isAuthorized, loading, refreshing, submitting, error, submitError, history, draft, setDraft, selectedCommand, selectedCommandId, setSelectedCommandId, refresh, submitCommand, requestApproval } = useSuperAdminCommandCenter();

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
                  <CommandApprovalStatus approvalRequired={selectedCommand.approvalRequired} approvalStatus={selectedCommand.approvalStatus} />
                </div>
                <CommandExecutionStatus queueHandoffState={selectedCommand.queueHandoffState} executionOutcome={selectedCommand.executionOutcome} />
                {selectedCommand.executionSummary ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{selectedCommand.executionSummary}</div> : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={submitting || !selectedCommand.approvalRequired || selectedCommand.approvalStatus === 'approved' || selectedCommand.approvalStatus === 'pending'}
                    onClick={() => void requestApproval(selectedCommand.id)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700 disabled:opacity-50"
                  >
                    Request Approval
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
    </div>
  );
}