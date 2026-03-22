import React, { useMemo, useState } from 'react';
import useReminderQueue from '../../hooks/useReminderQueue';
import ReminderQueuePanel from '../../components/reminders/ReminderQueuePanel';
import { getReminderTypeLabel } from '../../services/lifecycleReminderService';

export default function LifecycleAutomationPage() {
  const { user, checkingAccess, isAuthorized, loading, refreshing, error, dependencyNotes, reminders, metrics, tenantOptions, refresh, updateReminder } = useReminderQueue();
  const [tenantFilter, setTenantFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const typeOptions = useMemo(
    () => Array.from(new Set(reminders.map((reminder) => reminder.type))).sort(),
    [reminders]
  );

  const filteredReminders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reminders.filter((reminder) => {
      if (tenantFilter !== 'all' && reminder.tenantId !== tenantFilter) return false;
      if (statusFilter !== 'all' && reminder.status !== statusFilter) return false;
      if (typeFilter !== 'all' && reminder.type !== typeFilter) return false;
      if (!query) return true;
      return [reminder.clientLabel, reminder.title, reminder.summary, reminder.internalReason, reminder.currentStage]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [reminders, search, statusFilter, tenantFilter, typeFilter]);

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying lifecycle automation access...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal communication queue access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal/admin users. Client-facing users should only see their own internal guidance threads inside the portal.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Internal Lifecycle Communication</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Portal Communication Queue</h1>
          <p className="mt-1 text-sm text-slate-400">Funding-first internal communication candidates derived from stage state and task brain signals, with calm suppression controls and no external delivery in this slice.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={refreshing} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">
          {refreshing ? 'Refreshing...' : 'Refresh Queue'}
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['Total Candidates', metrics.total],
          ['Pending', metrics.pending],
          ['Posted / Cooling Down', metrics.sent],
          ['Snoozed', metrics.suppressed],
          ['Dismissed', metrics.dismissed],
          ['Resolved', metrics.completed],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm grid gap-4 xl:grid-cols-4">
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Tenant</span>
          <select value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
            <option value="all">All tenants</option>
            {tenantOptions.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
            <option value="all">All statuses</option>
            {['pending', 'sent', 'suppressed', 'dismissed', 'completed'].map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
            <option value="all">All reminder types</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>{getReminderTypeLabel(type)}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, reason, stage" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" />
        </label>
      </div>

      {loading ? <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading portal communication queue...</div> : <ReminderQueuePanel reminders={filteredReminders} onAction={updateReminder} />}

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Data / API Dependency Notes</p>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          {dependencyNotes.map((note) => (
            <div key={note} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">{note}</div>
          ))}
        </div>
      </section>
    </div>
  );
}