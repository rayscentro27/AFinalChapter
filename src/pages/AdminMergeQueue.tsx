import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = {
  id: string;
  name: string;
};

type SuggestionContact = {
  id: string;
  display_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  conversation_count?: number;
  identity_count?: number;
};

type SuggestionEvidence = {
  identity_type: string;
  identity_value: string;
  contacts_count?: number;
  verified_count?: number;
  providers?: string[];
};

type MergeSuggestion = {
  suggestion_key: string;
  strength: 'strong' | 'medium' | string;
  score: number;
  reasons: string[];
  source_contact: SuggestionContact;
  target_contact: SuggestionContact;
  identity_evidence: SuggestionEvidence[];
};

type MergePreviewIdentity = {
  provider: string;
  identity_type: string;
  identity_value: string;
  channel_account_id?: string | null;
  verified?: boolean;
  confidence?: number;
  is_primary?: boolean;
};

type MergePreviewData = {
  ok: true;
  conflicts: { block: boolean; reasons: string[] };
  warnings: string[];
  summary: {
    from: { identity_count: number; conversation_count: number };
    into: { identity_count: number; conversation_count: number };
    move: { identities_to_move: number; conversations_to_move: number };
  } | null;
  identity_overlap: {
    exact_matches: MergePreviewIdentity[];
    from_only: MergePreviewIdentity[];
    into_only: MergePreviewIdentity[];
  };
};

type MergePreviewState = MergePreviewData | { ok: false; error?: string } | null;

function labelForContact(contact: SuggestionContact): string {
  return [contact.display_name, contact.primary_email, contact.primary_phone].filter(Boolean).join(' | ') || contact.id;
}

function strengthClass(strength: string): string {
  return String(strength).toLowerCase() === 'strong'
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
    : 'border-amber-500/40 bg-amber-500/10 text-amber-200';
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required');
  return token;
}

export default function AdminMergeQueue() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');

  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [selectedSuggestionKey, setSelectedSuggestionKey] = useState('');
  const [preview, setPreview] = useState<MergePreviewState>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const [search, setSearch] = useState('');
  const [strengthFilter, setStrengthFilter] = useState<'all' | 'strong' | 'medium'>('all');
  const [limit, setLimit] = useState(100);

  const selectedSuggestion = useMemo(
    () => suggestions.find((s) => s.suggestion_key === selectedSuggestionKey) || null,
    [suggestions, selectedSuggestionKey]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return suggestions.filter((row) => {
      if (strengthFilter !== 'all' && String(row.strength).toLowerCase() !== strengthFilter) return false;

      if (!q) return true;

      const hay = [
        row.source_contact?.display_name,
        row.source_contact?.primary_email,
        row.source_contact?.primary_phone,
        row.target_contact?.display_name,
        row.target_contact?.primary_email,
        row.target_contact?.primary_phone,
        ...(row.reasons || []),
        ...(row.identity_evidence || []).map((e) => `${e.identity_type} ${e.identity_value}`),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return hay.includes(q);
    });
  }, [suggestions, search, strengthFilter]);

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      setError('');

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in');

        const { data: tenantRows, error: tenantErr } = await supabase
          .from('tenants')
          .select('id,name')
          .order('name', { ascending: true });

        if (tenantErr) throw tenantErr;
        if (!active) return;

        const list = (tenantRows || []) as Tenant[];
        setTenants(list);
        if (list.length > 0) setTenantId(list[0].id);
      } catch (e: any) {
        if (active) setError(String(e?.message || e));
      } finally {
        if (active) setLoading(false);
      }
    }

    void boot();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void loadSuggestions(tenantId, limit);
  }, [tenantId, limit]);

  useEffect(() => {
    if (!selectedSuggestion) {
      setPreview(null);
      return;
    }
    void loadPreview(selectedSuggestion);
  }, [selectedSuggestionKey]);

  async function loadSuggestions(currentTenantId = tenantId, currentLimit = limit) {
    if (!currentTenantId) return;

    try {
      setRefreshing(true);
      setError('');
      setSuccess('');

      const token = await getAccessToken();
      const response = await fetch(
        `/.netlify/functions/admin-merge-suggestions?tenant_id=${encodeURIComponent(currentTenantId)}&limit=${encodeURIComponent(String(currentLimit))}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        suggestions?: MergeSuggestion[];
      };

      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || `Merge suggestions failed (${response.status})`));
      }

      const nextSuggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
      setSuggestions(nextSuggestions);

      if (!nextSuggestions.some((s) => s.suggestion_key === selectedSuggestionKey)) {
        setSelectedSuggestionKey(nextSuggestions[0]?.suggestion_key || '');
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  async function loadPreview(suggestion: MergeSuggestion) {
    if (!tenantId || !suggestion) return;

    try {
      setPreviewBusy(true);
      setError('');

      const token = await getAccessToken();
      const response = await fetch('/.netlify/functions/admin-merge-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          from_contact_id: suggestion.source_contact.id,
          into_contact_id: suggestion.target_contact.id,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || `Merge preview failed (${response.status})`));
      }

      setPreview(payload as MergePreviewData);
    } catch (e: any) {
      setPreview({ ok: false, error: String(e?.message || e) });
    } finally {
      setPreviewBusy(false);
    }
  }

  async function approveSuggestion(suggestion: MergeSuggestion) {
    if (!tenantId || !suggestion) return;

    try {
      setActionBusy(true);
      setError('');
      setSuccess('');

      const token = await getAccessToken();
      const primaryEvidence = suggestion.identity_evidence?.[0];
      const reason = `Merge queue approval: ${suggestion.reasons?.[0] || 'overlapping identity evidence'}`;

      const response = await fetch('/.netlify/functions/admin-merge-approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          from_contact_id: suggestion.source_contact.id,
          into_contact_id: suggestion.target_contact.id,
          suggestion_key: suggestion.suggestion_key,
          identity_type: primaryEvidence?.identity_type,
          identity_value: primaryEvidence?.identity_value,
          reason,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        const reasons = Array.isArray(payload?.reasons) ? payload.reasons.join(', ') : '';
        throw new Error(String(payload?.error || reasons || `Approve failed (${response.status})`));
      }

      setSuccess(`Suggestion approved and merged. Job #${Number(payload?.job_id || 0) || 'created'}.`);
      await loadSuggestions();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setActionBusy(false);
    }
  }

  async function rejectSuggestion(suggestion: MergeSuggestion) {
    if (!tenantId || !suggestion) return;

    try {
      setActionBusy(true);
      setError('');
      setSuccess('');

      const token = await getAccessToken();
      const primaryEvidence = suggestion.identity_evidence?.[0];

      const response = await fetch('/.netlify/functions/admin-merge-reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          suggestion_key: suggestion.suggestion_key,
          from_contact_id: suggestion.source_contact.id,
          into_contact_id: suggestion.target_contact.id,
          identity_type: primaryEvidence?.identity_type,
          identity_value: primaryEvidence?.identity_value,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || `Reject failed (${response.status})`));
      }

      setSuccess('Suggestion rejected. It will be hidden from future suggestions unless evidence changes.');
      await loadSuggestions();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) {
    return <div className="max-w-7xl mx-auto p-6 text-slate-200">Loading merge queue...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Bulk Merge Queue</h1>
          <p className="text-sm text-slate-400 mt-2">Review ranked duplicate-contact suggestions and approve/reject with preview.</p>
        </div>
        <button
          onClick={() => void loadSuggestions()}
          disabled={refreshing || !tenantId}
          className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{success}</div>
      ) : null}

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Tenant</label>
          <select
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Strength</label>
          <select
            value={strengthFilter}
            onChange={(event) => setStrengthFilter(event.target.value as 'all' | 'strong' | 'medium')}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
          >
            <option value="all">All</option>
            <option value="strong">Strong</option>
            <option value="medium">Medium</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Limit</label>
          <input
            type="number"
            min={1}
            max={200}
            value={limit}
            onChange={(event) => setLimit(Math.min(200, Math.max(1, Number(event.target.value) || 100)))}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Search</label>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, email, phone, reason"
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 text-sm font-black uppercase tracking-widest text-slate-300">
            Suggestions ({filtered.length})
          </div>

          <div className="divide-y divide-white/5 max-h-[60vh] overflow-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">No suggestions for this filter.</div>
            ) : (
              filtered.map((row) => {
                const active = row.suggestion_key === selectedSuggestionKey;

                return (
                  <div
                    key={row.suggestion_key}
                    className={`p-5 space-y-3 cursor-pointer transition-colors ${active ? 'bg-blue-500/10' : 'hover:bg-white/5'}`}
                    onClick={() => setSelectedSuggestionKey(row.suggestion_key)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-100">
                          {labelForContact(row.source_contact)}
                          <span className="mx-2 text-slate-500">-&gt;</span>
                          {labelForContact(row.target_contact)}
                        </div>
                        <div className="text-xs text-slate-400">{row.reasons.join(' | ')}</div>
                      </div>

                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${strengthClass(row.strength)}`}>
                        {row.strength}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(row.identity_evidence || []).slice(0, 3).map((ev, idx) => (
                        <span key={`${ev.identity_type}:${ev.identity_value}:${idx}`} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-mono text-slate-300">
                          {ev.identity_type}:{ev.identity_value}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void approveSuggestion(row);
                        }}
                        disabled={actionBusy}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-emerald-100 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void rejectSuggestion(row);
                        }}
                        disabled={actionBusy}
                        className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-rose-100 disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <span className="text-xs text-slate-500">score {row.score}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="xl:col-span-2 bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 text-sm font-black uppercase tracking-widest text-slate-300">
            Preview
          </div>

          {!selectedSuggestion ? (
            <div className="p-6 text-sm text-slate-400">Select a suggestion to preview merge details.</div>
          ) : previewBusy ? (
            <div className="p-6 text-sm text-slate-400">Loading preview...</div>
          ) : preview?.ok === false ? (
            <div className="p-6 text-sm text-red-300">{preview.error || 'Preview failed'}</div>
          ) : preview?.ok === true ? (
            <div className="p-6 space-y-4">
              {preview.conflicts.block ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
                  <div className="text-sm font-black uppercase tracking-wider text-red-200">Blocked</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-red-100">
                    {(preview.conflicts.reasons || []).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  No hard-block conflicts.
                </div>
              )}

              {(preview.warnings || []).length > 0 ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                  <div className="text-sm font-black uppercase tracking-wider text-amber-200">Warnings</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-amber-100">
                    {(preview.warnings || []).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.summary ? (
                <div className="text-sm text-slate-300 space-y-1">
                  <div>
                    <span className="font-semibold">From:</span> {preview.summary.from.identity_count} identities, {preview.summary.from.conversation_count} conversations
                  </div>
                  <div>
                    <span className="font-semibold">Into:</span> {preview.summary.into.identity_count} identities, {preview.summary.into.conversation_count} conversations
                  </div>
                  <div>
                    <span className="font-semibold">Move:</span> {preview.summary.move.identities_to_move} identities, {preview.summary.move.conversations_to_move} conversations
                  </div>
                </div>
              ) : null}

              <details className="rounded-xl border border-white/10 bg-black/20 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-200">Identity overlap</summary>
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-slate-400">From-only: {preview.identity_overlap.from_only.length}</div>
                  <div className="text-xs text-slate-400">Exact matches: {preview.identity_overlap.exact_matches.length}</div>
                  <div className="text-xs text-slate-400">Into-only: {preview.identity_overlap.into_only.length}</div>
                </div>
              </details>
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-400">Preview not available.</div>
          )}
        </div>
      </div>
    </div>
  );
}
