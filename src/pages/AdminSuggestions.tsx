import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = { id: string; name: string };

type Contact = {
  id: string;
  display_name?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
};

type Suggestion = {
  id: string;
  suggestion_type: 'merge_contacts' | 'link_identity' | string;
  status: 'open' | 'approved' | 'rejected' | string;
  strength: 'strong' | 'medium' | 'weak' | string;
  score: number;
  reasons: Array<string | { signal?: string; value?: string; weight?: number }>;
  source_contact_id: string;
  target_contact_id: string;
  source_contact?: Contact | null;
  target_contact?: Contact | null;
  created_at: string;
};

function asReasonText(reason: any): string {
  if (!reason) return '';
  if (typeof reason === 'string') return reason;
  const signal = String(reason?.signal || '').trim();
  const value = String(reason?.value || '').trim();
  if (signal && value) return `${signal}: ${value}`;
  if (signal) return signal;
  return JSON.stringify(reason);
}

function label(contact?: Contact | null): string {
  if (!contact) return 'Unknown';
  const parts = [contact.display_name, contact.primary_email, contact.primary_phone].filter(Boolean);
  return parts.join(' | ') || contact.id;
}

function badgeClass(strength: string): string {
  const lower = String(strength || '').toLowerCase();
  if (lower === 'strong') return 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40';
  if (lower === 'medium') return 'bg-amber-500/20 text-amber-200 border border-amber-500/40';
  return 'bg-slate-500/20 text-slate-200 border border-slate-400/40';
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required');
  return token;
}

export default function AdminSuggestions() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');

  const [typeFilter, setTypeFilter] = useState<'all' | 'merge_contacts' | 'link_identity'>('all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'approved' | 'rejected' | 'all'>('open');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return suggestions.filter((row) => {
      if (typeFilter !== 'all' && row.suggestion_type !== typeFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!q) return true;

      const hay = [
        row.suggestion_type,
        row.strength,
        label(row.source_contact),
        label(row.target_contact),
        ...(row.reasons || []).map(asReasonText),
      ]
        .join(' ')
        .toLowerCase();

      return hay.includes(q);
    });
  }, [suggestions, typeFilter, statusFilter, search]);

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      setError('');

      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!userData?.user?.id) throw new Error('Not signed in');

        const { data: tenantRows, error: tenantErr } = await supabase
          .from('tenants')
          .select('id,name')
          .order('name', { ascending: true });

        if (tenantErr) throw tenantErr;
        if (!active) return;

        const next = (tenantRows || []) as Tenant[];
        setTenants(next);
        if (next.length > 0) setTenantId(next[0].id);
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
    void loadSuggestions(true);
  }, [tenantId, typeFilter, statusFilter, limit]);

  async function loadSuggestions(refresh = false) {
    if (!tenantId) return;

    setRefreshing(true);
    setError('');

    try {
      const token = await accessToken();
      const params = new URLSearchParams();
      params.set('tenant_id', tenantId);
      params.set('limit', String(limit));
      params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      params.set('refresh', refresh ? 'true' : 'false');

      const response = await fetch(`/.netlify/functions/admin-suggestions?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        suggestions?: Suggestion[];
      };

      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || `Suggestions request failed (${response.status})`));
      }

      setSuggestions(Array.isArray(payload?.suggestions) ? payload.suggestions : []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  async function approveSuggestion(suggestionId: string) {
    if (!tenantId || !suggestionId) return;
    setActionBusy(true);
    setError('');
    setSuccess('');

    try {
      const token = await accessToken();
      const response = await fetch('/.netlify/functions/admin-suggestions-approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenant_id: tenantId, suggestion_id: suggestionId }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || `Approve failed (${response.status})`));
      }

      setSuccess('Suggestion approved.');
      await loadSuggestions(false);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setActionBusy(false);
    }
  }

  async function rejectSuggestion(suggestionId: string) {
    if (!tenantId || !suggestionId) return;
    setActionBusy(true);
    setError('');
    setSuccess('');

    try {
      const token = await accessToken();
      const response = await fetch('/.netlify/functions/admin-suggestions-reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenant_id: tenantId, suggestion_id: suggestionId }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || `Reject failed (${response.status})`));
      }

      setSuccess('Suggestion rejected.');
      await loadSuggestions(false);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-slate-300">Loading suggestions...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">AI Suggestions</h1>
        <p className="text-slate-400 text-sm mt-1">Review ranked contact merge/link suggestions and approve or reject with evidence.</p>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 grid gap-3 md:grid-cols-6">
        <select className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
          ))}
        </select>

        <select className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
          <option value="all">All types</option>
          <option value="merge_contacts">Merge contacts</option>
          <option value="link_identity">Link identity</option>
        </select>

        <select className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="open">Open</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>

        <input
          className="md:col-span-2 bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search names, evidence, reasons"
        />

        <div className="flex gap-2">
          <input
            className="w-20 bg-slate-800 border border-slate-600 rounded-md px-2 py-2 text-sm text-slate-100"
            value={limit}
            type="number"
            min={1}
            max={200}
            onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value || 100))))}
          />
          <button className="flex-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-2 disabled:opacity-50" onClick={() => void loadSuggestions(true)} disabled={refreshing || !tenantId}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6 text-slate-400 text-sm">No suggestions for this filter.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map((row) => (
              <div key={row.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${badgeClass(row.strength)}`}>{row.strength}</span>
                    <span className="text-xs text-slate-400">score {row.score}</span>
                    <span className="text-xs text-slate-400">{row.suggestion_type}</span>
                    <span className="text-xs text-slate-500">{row.status}</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 disabled:opacity-50"
                      disabled={actionBusy || row.status !== 'open'}
                      onClick={() => void approveSuggestion(row.id)}
                    >
                      Approve
                    </button>
                    <button
                      className="rounded bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 disabled:opacity-50"
                      disabled={actionBusy || row.status !== 'open'}
                      onClick={() => void rejectSuggestion(row.id)}
                    >
                      Reject
                    </button>
                  </div>
                </div>

                <div className="text-sm text-slate-200">
                  <div><span className="text-slate-400">Source:</span> {label(row.source_contact)}</div>
                  <div><span className="text-slate-400">Target:</span> {label(row.target_contact)}</div>
                </div>

                <div className="text-xs text-slate-300">
                  {(row.reasons || []).slice(0, 5).map((reason, index) => (
                    <div key={`${row.id}-${index}`}>• {asReasonText(reason)}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
