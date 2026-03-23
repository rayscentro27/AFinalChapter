import React, { useState } from 'react';
import AddSourceModal from '../components/sourceRegistry/AddSourceModal';
import SourceListTable from '../components/sourceRegistry/SourceListTable';
import { useSourceRegistry } from '../hooks/useSourceRegistry';

export default function AdminSourceRegistryPage() {
  const { user, checkingAccess, isAuthorized, loading, refreshing, submitting, error, items, statusFilter, setStatusFilter, typeFilter, setTypeFilter, search, setSearch, selectedSourceId, setSelectedSourceId, refresh, addSource, runSourceAction } = useSourceRegistry();
  const [modalOpen, setModalOpen] = useState(false);

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying source registry access...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal source registry access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal/admin users only.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#eff6ff_45%,#f8fafc_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Source Registry</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Research source registry</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Manage persistent YouTube channels, websites, and research sources with operational clarity and clear validation warnings.</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700" onClick={() => setModalOpen(true)}>Add Source</button>
            <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? 'Refreshing...' : 'Refresh Sources'}</button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="review">Needs review</option>
          </select>
          <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All types</option>
            <option value="website">Website</option>
            <option value="youtube_channel">YouTube Channel</option>
            <option value="rss">RSS Feed</option>
          </select>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search URL, label, or domain" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 xl:col-span-2" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Active Sources</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{items.filter((item) => item.active).length}</p>
          <p className="mt-2 text-sm text-slate-600">Sources currently enabled for operations.</p>
        </div>
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Paused Sources</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{items.filter((item) => item.paused).length}</p>
          <p className="mt-2 text-sm text-slate-600">Source-level pauses currently in effect.</p>
        </div>
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Schedules Paused</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{items.filter((item) => item.schedulePaused).length}</p>
          <p className="mt-2 text-sm text-slate-600">Schedulers blocked pending review or manual restart.</p>
        </div>
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Needs Review</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{items.filter((item) => item.warnings.length > 0).length}</p>
          <p className="mt-2 text-sm text-slate-600">Sources with duplicate or validation warnings.</p>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {loading && items.length === 0 ? <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Loading source registry...</div> : null}

      {selectedSourceId ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Source focus is active for `{selectedSourceId}`. The table row is highlighted and the URL query stays in sync for drill-through use.
        </div>
      ) : null}

      <SourceListTable items={items} disabled={submitting} selectedSourceId={selectedSourceId} onSelect={setSelectedSourceId} onAction={(payload) => { void runSourceAction(payload); }} />

      <AddSourceModal open={modalOpen} submitting={submitting} onClose={() => setModalOpen(false)} onSubmit={addSource} />
    </div>
  );
}