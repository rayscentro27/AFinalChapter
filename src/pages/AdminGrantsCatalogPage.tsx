import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { GrantCatalogRow } from '../services/grantsEngineService';

type DraftRow = {
  id: string;
  source: string;
  name: string;
  sponsor: string;
  url: string;
  geographyText: string;
  tagsText: string;
  eligibility_md: string;
  award_range_md: string;
  deadline_date: string;
  is_active: boolean;
};

function toDraft(row: GrantCatalogRow): DraftRow {
  return {
    id: row.id,
    source: row.source || 'manual',
    name: row.name || '',
    sponsor: row.sponsor || '',
    url: row.url || '',
    geographyText: (row.geography || []).join(', '),
    tagsText: (row.industry_tags || []).join(', '),
    eligibility_md: row.eligibility_md || '',
    award_range_md: row.award_range_md || '',
    deadline_date: row.deadline_date || '',
    is_active: Boolean(row.is_active),
  };
}

function csvToArray(input: string): string[] {
  return String(input || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function scoreRow(row: DraftRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;
  const name = row.name.toLowerCase();
  const sponsor = row.sponsor.toLowerCase();
  const tags = row.tagsText.toLowerCase();
  if (name === normalizedQuery) return 100;
  if (name.startsWith(normalizedQuery)) return 80;
  if (name.includes(normalizedQuery)) return 60;
  if (sponsor.includes(normalizedQuery)) return 45;
  if (tags.includes(normalizedQuery)) return 25;
  return 10;
}

export default function AdminGrantsCatalogPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('query') || '');

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([]);

  async function loadRows() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: readError } = await supabase
        .from('grants_catalog')
        .select('id,source,name,sponsor,url,geography,industry_tags,eligibility_md,award_range_md,deadline_date,is_active,created_at,updated_at')
        .order('deadline_date', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });

      if (readError) {
        throw new Error(readError.message || 'Unable to load grants catalog.');
      }

      setRows(((data || []) as GrantCatalogRow[]).map(toDraft));
    } catch (e: any) {
      setError(String(e?.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, [isAdmin]);

  useEffect(() => {
    const nextUrl = new URL(window.location.href);
    if (search.trim()) nextUrl.searchParams.set('query', search.trim());
    else nextUrl.searchParams.delete('query');
    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`);
  }, [search]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows
      .filter((row) => [row.name, row.sponsor, row.source, row.url, row.geographyText, row.tagsText, row.eligibility_md, row.award_range_md].join(' ').toLowerCase().includes(query))
      .sort((left, right) => scoreRow(right, query) - scoreRow(left, query));
  }, [rows, search]);
  const highlightedRowId = search.trim() ? filteredRows[0]?.id || '' : '';

  function updateRow(id: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function addRow() {
    const tempId = `tmp_${Date.now()}`;
    setRows((prev) => [
      {
        id: tempId,
        source: 'manual',
        name: '',
        sponsor: '',
        url: '',
        geographyText: 'US',
        tagsText: '',
        eligibility_md: 'Educational placeholder eligibility details.',
        award_range_md: '$5,000 - $25,000',
        deadline_date: '',
        is_active: true,
      },
      ...prev,
    ]);
  }

  async function saveRow(row: DraftRow) {
    if (!row.name.trim()) {
      setError('Grant name is required.');
      return;
    }
    if (!row.sponsor.trim()) {
      setError('Sponsor is required.');
      return;
    }
    if (!row.eligibility_md.trim()) {
      setError('Eligibility notes are required.');
      return;
    }

    setSavingId(row.id);
    setError('');
    setSuccess('');

    try {
      const payload = {
        id: row.id.startsWith('tmp_') ? undefined : row.id,
        source: row.source.trim() || 'manual',
        name: row.name.trim(),
        sponsor: row.sponsor.trim(),
        url: row.url.trim() || null,
        geography: csvToArray(row.geographyText),
        industry_tags: csvToArray(row.tagsText),
        eligibility_md: row.eligibility_md.trim(),
        award_range_md: row.award_range_md.trim() || null,
        deadline_date: row.deadline_date.trim() || null,
        is_active: row.is_active,
      };

      const { error: upsertError } = await supabase
        .from('grants_catalog')
        .upsert(payload);

      if (upsertError) {
        throw new Error(upsertError.message || 'Unable to save grants catalog row.');
      }

      setSuccess(`Saved: ${payload.name}`);
      await loadRows();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRow(row: DraftRow) {
    if (row.id.startsWith('tmp_')) {
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const { error: deleteError } = await supabase
        .from('grants_catalog')
        .delete()
        .eq('id', row.id);

      if (deleteError) {
        throw new Error(deleteError.message || 'Unable to delete grants catalog row.');
      }

      setSuccess('Catalog row deleted.');
      await loadRows();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading grants catalog...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Admin Grants Catalog</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage educational grant references. Keep copy compliant and avoid guaranteed outcome language.
          </p>
        </div>
        <button
          onClick={addRow}
          className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-950"
        >
          Add Grant
        </button>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
        <label className="block text-xs font-black uppercase tracking-[0.2em] text-slate-400">Scoped Search</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search grant name, sponsor, source, tags, geography, or eligibility"
          className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
        />
        {search.trim() ? <p className="mt-2 text-xs text-cyan-300">Scoped drill-through active for: {search.trim()}</p> : null}
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      {filteredRows.length === 0 ? <div className="text-sm text-slate-500">No grants match the current filter.</div> : null}

      <div className="space-y-4">
        {filteredRows.map((row) => (
          <div key={row.id} className={`rounded-2xl border p-4 space-y-3 ${row.id === highlightedRowId ? 'border-cyan-400 bg-cyan-950/20 shadow-[0_0_0_1px_rgba(34,211,238,0.35)]' : 'border-slate-700 bg-slate-900'}`}>
            {row.id === highlightedRowId ? <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Top scoped match</div> : null}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                value={row.name}
                onChange={(e) => updateRow(row.id, { name: e.target.value })}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                placeholder="Grant name"
              />
              <input
                value={row.sponsor}
                onChange={(e) => updateRow(row.id, { sponsor: e.target.value })}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                placeholder="Sponsor"
              />
              <input
                value={row.source}
                onChange={(e) => updateRow(row.id, { source: e.target.value })}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                placeholder="Source"
              />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={row.is_active}
                  onChange={() => updateRow(row.id, { is_active: !row.is_active })}
                />
                Active
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                value={row.url}
                onChange={(e) => updateRow(row.id, { url: e.target.value })}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                placeholder="URL"
              />
              <input
                value={row.geographyText}
                onChange={(e) => updateRow(row.id, { geographyText: e.target.value })}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                placeholder="Geography CSV"
              />
              <input
                value={row.tagsText}
                onChange={(e) => updateRow(row.id, { tagsText: e.target.value })}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                placeholder="Industry tags CSV"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={row.award_range_md}
                onChange={(e) => updateRow(row.id, { award_range_md: e.target.value })}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                placeholder="Award range"
              />
              <input
                type="date"
                value={row.deadline_date}
                onChange={(e) => updateRow(row.id, { deadline_date: e.target.value })}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
              />
            </div>

            <textarea
              value={row.eligibility_md}
              onChange={(e) => updateRow(row.id, { eligibility_md: e.target.value })}
              rows={4}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
              placeholder="Eligibility markdown"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => void deleteRow(row)}
                disabled={busy}
                className="rounded-md border border-rose-500/50 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
              >
                Delete
              </button>
              <button
                onClick={() => void saveRow(row)}
                disabled={savingId === row.id}
                className="rounded-md bg-cyan-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
              >
                {savingId === row.id ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
