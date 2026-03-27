import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'nexus_inbox_saved_views_v1';

type AssignedFilter = 'any' | 'unassigned' | 'mine' | 'ai' | 'agent';
type SlaFilter = 'any' | 'stale' | 'breach';
type StatusFilter = 'any' | 'open' | 'pending' | 'pending_client' | 'pending_staff' | 'escalated' | 'closed';
type ProviderFilter = 'any' | 'meta' | 'matrix' | 'google_voice';

export type InboxFilters = {
  q: string;
  status: StatusFilter;
  provider: ProviderFilter;
  assigned: AssignedFilter;
  function FiltersToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
    return (
      <button
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold text-sm shadow-sm hover:bg-slate-50 transition-all"
        onClick={onClick}
      >
        Filters <span role="img" aria-label="settings">⚙️</span>
      </button>
    );
  }
  sla: SlaFilter;
  export default function InboxFiltersBar(props: { filters: InboxFilters; onChange: (filters: InboxFilters) => void }) {
};

type SavedView = {
    const [showFilters, setShowFilters] = useState(false);
  filters: Omit<InboxFilters, 'meUserId'>;
};

const DEFAULT_VIEWS: SavedView[] = [
  { name: 'Unassigned', filters: { q: '', status: 'any', provider: 'any', assigned: 'unassigned', sla: 'any' } },
  { name: 'My Conversations', filters: { q: '', status: 'any', provider: 'any', assigned: 'mine', sla: 'any' } },
  { name: 'Breach Only', filters: { q: '', status: 'any', provider: 'any', assigned: 'any', sla: 'breach' } },
  { name: 'Messenger', filters: { q: '', status: 'any', provider: 'meta', assigned: 'any', sla: 'any' } },
  { name: 'Pending Client', filters: { q: '', status: 'pending_client', provider: 'any', assigned: 'any', sla: 'any' } },
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
    <div className="space-y-3 rounded-2xl border border-[#E2EAF7] bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search subject, tags, last message"
          className="min-w-[220px] flex-1 rounded-xl border border-[#DCE7FA] bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#4A7AE8]"
        />

        <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="rounded-xl border border-[#DCE7FA] bg-white px-2.5 py-2 text-xs font-bold uppercase tracking-widest text-slate-700">
          <option value="any">Status: Any</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="pending_client">Pending Client</option>
          <option value="pending_staff">Pending Staff</option>
          <option value="escalated">Escalated</option>
          <option value="closed">Closed</option>
        </select>

        <select value={provider} onChange={(event) => setProvider(event.target.value as ProviderFilter)} className="rounded-xl border border-[#DCE7FA] bg-white px-2.5 py-2 text-xs font-bold uppercase tracking-widest text-slate-700">
          <option value="any">Channel: Any</option>
          <option value="meta">Facebook/Instagram Messenger</option>
          <option value="matrix">Matrix</option>
          <option value="google_voice">Google Voice</option>
        </select>

        <select value={assigned} onChange={(event) => setAssigned(event.target.value as AssignedFilter)} className="rounded-xl border border-[#DCE7FA] bg-white px-2.5 py-2 text-xs font-bold uppercase tracking-widest text-slate-700">
          <option value="any">Assigned: Any</option>
          <option value="unassigned">Unassigned</option>
          <option value="mine">Mine</option>
          <option value="ai">AI</option>
          <option value="agent">Agent</option>
        </select>

        <select value={sla} onChange={(event) => setSla(event.target.value as SlaFilter)} className="rounded-xl border border-[#DCE7FA] bg-white px-2.5 py-2 text-xs font-bold uppercase tracking-widest text-slate-700">
          <option value="any">SLA: Any</option>
          <option value="stale">Stale</option>
          <option value="breach">Breach</option>
        </select>

        <button
          onClick={saveCurrentView}
          className="rounded-xl bg-[linear-gradient(135deg,#2E58E6,#4D8BFF)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_10px_20px_rgba(46,88,230,0.16)]"
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
              className="rounded-lg border border-[#DCE7FA] bg-[#F4F8FF] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-[#315FD0]"
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
