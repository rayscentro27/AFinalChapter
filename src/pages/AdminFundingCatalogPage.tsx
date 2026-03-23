import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

type CatalogRow = {
  id: string;
  is_active: boolean;
  name: string;
  regions: string[];
  products: Record<string, unknown>[];
  requirements: Record<string, unknown>;
  notes_md: string | null;
  created_at: string;
  updated_at: string;
};

type DraftRow = {
  id: string;
  is_active: boolean;
  name: string;
  regionsText: string;
  productsText: string;
  requirementsText: string;
  notes_md: string;
};

function toDraft(row: CatalogRow): DraftRow {
  return {
    id: row.id,
    is_active: Boolean(row.is_active),
    name: row.name || '',
    regionsText: Array.isArray(row.regions) ? row.regions.join(', ') : '',
    productsText: JSON.stringify(row.products || [], null, 2),
    requirementsText: JSON.stringify(row.requirements || {}, null, 2),
    notes_md: row.notes_md || '',
  };
}

function parseRegions(input: string): string[] {
  return String(input || '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function parseProducts(input: string): Record<string, unknown>[] {
  const parsed = JSON.parse(input || '[]');
  if (!Array.isArray(parsed)) {
    throw new Error('Products JSON must be an array.');
  }
  return parsed as Record<string, unknown>[];
}

function parseRequirements(input: string): Record<string, unknown> {
  const parsed = JSON.parse(input || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Requirements JSON must be an object.');
  }
  return parsed as Record<string, unknown>;
}

function scoreRow(row: DraftRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;
  const name = row.name.toLowerCase();
  const regions = row.regionsText.toLowerCase();
  const notes = row.notes_md.toLowerCase();
  if (name === normalizedQuery) return 100;
  if (name.startsWith(normalizedQuery)) return 80;
  if (name.includes(normalizedQuery)) return 60;
  if (regions.includes(normalizedQuery)) return 40;
  if (notes.includes(normalizedQuery)) return 20;
  return 10;
}

export default function AdminFundingCatalogPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('query') || '');

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);

  async function loadCatalog() {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: readError } = await supabase
        .from('bank_catalog')
        .select('id,is_active,name,regions,products,requirements,notes_md,created_at,updated_at')
        .order('name', { ascending: true });

      if (readError) {
        throw new Error(readError.message || 'Unable to load bank catalog.');
      }

      const rows = ((data || []) as CatalogRow[]).map(toDraft);
      setDraftRows(rows);
    } catch (e: any) {
      setError(String(e?.message || e));
      setDraftRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
  }, [isSuperAdmin]);

  useEffect(() => {
    const nextUrl = new URL(window.location.href);
    if (search.trim()) nextUrl.searchParams.set('query', search.trim());
    else nextUrl.searchParams.delete('query');
    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`);
  }, [search]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return draftRows;
    return draftRows
      .filter((row) => [row.name, row.regionsText, row.productsText, row.requirementsText, row.notes_md].join(' ').toLowerCase().includes(query))
      .sort((left, right) => scoreRow(right, query) - scoreRow(left, query));
  }, [draftRows, search]);
  const highlightedRowId = search.trim() ? filteredRows[0]?.id || '' : '';

  function updateDraft(id: string, patch: Partial<DraftRow>) {
    setDraftRows((prev) => prev.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  async function saveRow(row: DraftRow) {
    setSavingId(row.id);
    setError('');
    setSuccess('');

    try {
      const payload = {
        id: row.id.startsWith('tmp_') ? undefined : row.id,
        is_active: row.is_active,
        name: row.name.trim(),
        regions: parseRegions(row.regionsText),
        products: parseProducts(row.productsText),
        requirements: parseRequirements(row.requirementsText),
        notes_md: row.notes_md.trim() || null,
      };

      if (!payload.name) {
        throw new Error('Bank name is required.');
      }

      const { error: upsertError } = await supabase
        .from('bank_catalog')
        .upsert(payload)
        .select('id');

      if (upsertError) {
        throw new Error(upsertError.message || 'Unable to save bank catalog row.');
      }

      setSuccess(`Saved: ${payload.name}`);
      await loadCatalog();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRow(rowId: string) {
    if (!rowId || rowId.startsWith('tmp_')) {
      setDraftRows((prev) => prev.filter((row) => row.id !== rowId));
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const { error: deleteError } = await supabase
        .from('bank_catalog')
        .delete()
        .eq('id', rowId);

      if (deleteError) {
        throw new Error(deleteError.message || 'Unable to delete catalog row.');
      }

      setSuccess('Catalog row deleted.');
      await loadCatalog();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  function addDraftRow() {
    const tempId = `tmp_${Date.now()}`;
    setDraftRows((prev) => [
      {
        id: tempId,
        is_active: true,
        name: '',
        regionsText: 'US',
        productsText: JSON.stringify([
          {
            key: 'PRODUCT_KEY',
            type: 'card',
            label: '0% APR Intro Product',
            intro_apr_percent: 0,
            intro_apr_months: 12,
            max_limit_cents: 1000000,
          },
        ], null, 2),
        requirementsText: JSON.stringify({ min_credit_score: 680 }, null, 2),
        notes_md: 'Educational placeholder. Client decides and submits applications.',
      },
      ...prev,
    ]);
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Super admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading funding bank catalog...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Funding Catalog Admin</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage educational bank/product research entries for Tier 1 packet generation. No guaranteed approvals language allowed.
          </p>
        </div>
        <button
          onClick={addDraftRow}
          className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-950"
        >
          Add Bank
        </button>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
        <label className="block text-xs font-black uppercase tracking-[0.2em] text-slate-400">Scoped Search</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search bank, region, product JSON, requirements, or notes"
          className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
        />
        {search.trim() ? <p className="mt-2 text-xs text-cyan-300">Scoped drill-through active for: {search.trim()}</p> : null}
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      {filteredRows.length === 0 ? <div className="text-sm text-slate-500">No catalog rows match the current filter.</div> : null}

      <div className="space-y-4">
        {filteredRows.map((row) => (
          <div key={row.id} className={`rounded-2xl border p-4 space-y-4 ${row.id === highlightedRowId ? 'border-cyan-400 bg-cyan-950/20 shadow-[0_0_0_1px_rgba(34,211,238,0.35)]' : 'border-slate-700 bg-slate-900'}`}>
            {row.id === highlightedRowId ? <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Top scoped match</div> : null}
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-sm text-slate-300">
                Name
                <input
                  className="ml-2 w-64 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
                  value={row.name}
                  onChange={(e) => updateDraft(row.id, { name: e.target.value })}
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={row.is_active}
                  onChange={() => updateDraft(row.id, { is_active: !row.is_active })}
                />
                Active
              </label>

              <label className="text-sm text-slate-300">
                Regions (CSV)
                <input
                  className="ml-2 w-64 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
                  value={row.regionsText}
                  onChange={(e) => updateDraft(row.id, { regionsText: e.target.value })}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Products JSON</label>
                <textarea
                  rows={8}
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-mono"
                  value={row.productsText}
                  onChange={(e) => updateDraft(row.id, { productsText: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Requirements JSON</label>
                <textarea
                  rows={8}
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-mono"
                  value={row.requirementsText}
                  onChange={(e) => updateDraft(row.id, { requirementsText: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Notes (Markdown)</label>
              <textarea
                rows={3}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-xs"
                value={row.notes_md}
                onChange={(e) => updateDraft(row.id, { notes_md: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => void deleteRow(row.id)}
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

      <p className="text-xs text-slate-500">Catalog entries are educational research references. Keep compliance language neutral and avoid guaranteed approval claims.</p>
    </div>
  );
}
