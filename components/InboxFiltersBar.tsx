import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'nexus_inbox_saved_views_v1';

type AssignedFilter = 'any' | 'unassigned' | 'mine' | 'ai' | 'agent';
type SlaFilter = 'any' | 'stale' | 'breach';
type StatusFilter = 'any' | 'open' | 'pending' | 'closed';
type ProviderFilter = 'any' | 'twilio' | 'whatsapp' | 'meta' | 'matrix' | 'google_voice';

export type InboxFilters = {
  q: string;
  status: StatusFilter;
  provider: ProviderFilter;
  assigned: AssignedFilter;
  sla: SlaFilter;
  meUserId?: string;
};

type SavedView = {
  name: string;
  filters: Omit<InboxFilters, 'meUserId'>;
};

const DEFAULT_VIEWS: SavedView[] = [
  { name: 'Unassigned', filters: { q: '', status: 'any', provider: 'any', assigned: 'unassigned', sla: 'any' } },
  { name: 'My Conversations', filters: { q: '', status: 'any', provider: 'any', assigned: 'mine', sla: 'any' } },
  { name: 'Breach Only', filters: { q: '', status: 'any', provider: 'any', assigned: 'any', sla: 'breach' } },
  { name: 'WhatsApp', filters: { q: '', status: 'any', provider: 'whatsapp', assigned: 'any', sla: 'any' } },
];

function readSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VIEWS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VIEWS;
    return parsed.filter((row) => row && typeof row.name === 'string' && row.filters && typeof row.filters === 'object');
  } catch {
    return DEFAULT_VIEWS;
  }
}

export default function InboxFiltersBar({
  meUserId,
  onChange,
}: {
  meUserId?: string;
  onChange?: (filters: InboxFilters) => void;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('any');
  const [provider, setProvider] = useState<ProviderFilter>('any');
  const [assigned, setAssigned] = useState<AssignedFilter>('any');
  const [sla, setSla] = useState<SlaFilter>('any');
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);

  useEffect(() => {
    setSavedViews(readSavedViews());
  }, []);

  const filters = useMemo(
    () => ({
      q: q.trim(),
      status,
      provider,
      assigned,
      sla,
      meUserId,
    }),
    [q, status, provider, assigned, sla, meUserId]
  );

  useEffect(() => {
    onChange?.(filters);
  }, [filters, onChange]);

  function saveCurrentView() {
    const name = window.prompt('Name this view:');
    if (!name) return;

    const next: SavedView[] = [
      {
        name,
        filters: {
          q,
          status,
          provider,
          assigned,
          sla,
        },
      },
      ...savedViews,
    ];

    setSavedViews(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function applyView(view: SavedView) {
    const f = view.filters || ({} as SavedView['filters']);
    setQ(f.q || '');
    setStatus((f.status as StatusFilter) || 'any');
    setProvider((f.provider as ProviderFilter) || 'any');
    setAssigned((f.assigned as AssignedFilter) || 'any');
    setSla((f.sla as SlaFilter) || 'any');
  }

  function removeView(index: number) {
    const next = savedViews.filter((_, idx) => idx !== index);
    setSavedViews(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search subject, tags, last message"
          className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500"
        />

        <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold uppercase tracking-widest text-slate-700">
          <option value="any">Status: Any</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
        </select>

        <select value={provider} onChange={(event) => setProvider(event.target.value as ProviderFilter)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold uppercase tracking-widest text-slate-700">
          <option value="any">Channel: Any</option>
          <option value="twilio">Twilio</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="meta">Meta</option>
          <option value="matrix">Matrix</option>
          <option value="google_voice">Google Voice</option>
        </select>

        <select value={assigned} onChange={(event) => setAssigned(event.target.value as AssignedFilter)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold uppercase tracking-widest text-slate-700">
          <option value="any">Assigned: Any</option>
          <option value="unassigned">Unassigned</option>
          <option value="mine">Mine</option>
          <option value="ai">AI</option>
          <option value="agent">Agent</option>
        </select>

        <select value={sla} onChange={(event) => setSla(event.target.value as SlaFilter)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold uppercase tracking-widest text-slate-700">
          <option value="any">SLA: Any</option>
          <option value="stale">Stale</option>
          <option value="breach">Breach</option>
        </select>

        <button
          onClick={saveCurrentView}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
        >
          Save View
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Saved</span>
        {savedViews.map((view, index) => (
          <span key={`${view.name}-${index}`} className="inline-flex items-center gap-1">
            <button
              onClick={() => applyView(view)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-700"
            >
              {view.name}
            </button>
            <button
              onClick={() => removeView(index)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500"
              title="Remove view"
            >
              x
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
