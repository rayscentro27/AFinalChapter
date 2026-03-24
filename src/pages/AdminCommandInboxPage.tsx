import React from 'react';
import CommandDetailPanel from '../components/commandInbox/CommandDetailPanel';
import QueueStatusTimeline from '../components/commandInbox/QueueStatusTimeline';
import RelatedAgentSummaries from '../components/commandInbox/RelatedAgentSummaries';
import RelatedSourceCard from '../components/commandInbox/RelatedSourceCard';
import CommandStatusBadge from '../components/superAdminCommand/CommandStatusBadge';
import type { RelatedSource } from '../hooks/useCommandInbox';
import { useCommandInbox } from '../hooks/useCommandInbox';

function openCommandCenter(commandId?: string) {
  const path = commandId ? `/admin/ai-command-center?command_id=${encodeURIComponent(commandId)}` : '/admin/ai-command-center';
  window.history.pushState({}, '', path);
  window.location.hash = 'admin_super_admin_command_center';
}

function openSourceRegistry(item: RelatedSource) {
  const params = new URLSearchParams();
  if (item.id) params.set('source_id', item.id);
  if (item.url) params.set('query', item.url);
  const query = params.toString();
  window.history.pushState({}, '', query ? `/admin/source-registry?${query}` : '/admin/source-registry');
  window.location.hash = 'admin_source_registry';
}

export default function AdminCommandInboxPage() {
  const { user, checkingAccess, isAuthorized, loading, refreshing, error, items, detail, statusFilter, setStatusFilter, selectedCommandId, setSelectedCommandId, refresh } = useCommandInbox();

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying command inbox access...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal command inbox access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal/admin users only.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_45%,#fff7ed_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Command Inbox</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Feedback loop visibility</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Inspect what command was sent, how the system understood it, whether work was queued, and which source or agent summaries were linked back.</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700" onClick={() => openCommandCenter(detail?.id)}>Open Command Center</button>
            <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? 'Refreshing...' : 'Refresh Inbox'}</button>
          </div>
        </div>
        <div className="mt-6 max-w-xs">
          <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="requires_approval">Requires approval</option>
            <option value="approved">Approved</option>
            <option value="queued">Queued</option>
            <option value="executing">Executing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {loading && items.length === 0 ? <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Loading command inbox...</div> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Recent Commands</p>
          <div className="mt-4 space-y-3">
            {items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No commands are available in the inbox yet.</div> : null}
            {items.map((item) => {
              const active = item.id === selectedCommandId;
              return (
                <button key={item.id} type="button" onClick={() => setSelectedCommandId(item.id)} className={`w-full rounded-[1.5rem] border px-4 py-4 text-left transition ${active ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-900 hover:bg-white'}`}>
                  <div className="text-sm font-semibold">{item.rawCommand}</div>
                  <div className={`mt-2 flex flex-wrap gap-2 ${active ? 'text-slate-200' : ''}`}>
                    <CommandStatusBadge label={item.commandType} />
                    <CommandStatusBadge label={`risk:${item.riskLevel}`} />
                    <CommandStatusBadge label={item.status} />
                    <CommandStatusBadge label={`approval:${item.approvalStatus}`} />
                    <CommandStatusBadge label={`execution:${item.executionOutcome}`} />
                  </div>
                  <div className={`mt-2 text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Timestamp unavailable'}</div>
                </button>
              );
            })}
          </div>
        </section>
        <div className="space-y-4">
          <CommandDetailPanel detail={detail} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <RelatedSourceCard item={detail?.relatedSource || null} onOpenSourceRegistry={openSourceRegistry} />
            <QueueStatusTimeline items={detail?.timeline || []} />
          </div>
          <RelatedAgentSummaries items={detail?.relatedAgentSummaries || []} />
        </div>
      </div>
    </div>
  );
}