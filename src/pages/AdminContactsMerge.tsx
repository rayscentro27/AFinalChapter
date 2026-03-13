import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

type ContactRow = {
  id: string;
  tenant_id: string;
  display_name: string | null;
  email?: string | null;
  phone_e164?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
  merged_into_contact_id?: string | null;
  created_at?: string;
};

type IdentityRow = {
  id: number;
  contact_id: string;
  provider: string;
  identity_type: string;
  identity_value: string;
  is_primary: boolean;
  verified: boolean;
  confidence: number;
};

type MergeSuggestion = {
  key: string;
  identity_type: string;
  identity_value: string;
  contact_ids: string[];
  strength: 'strong' | 'medium';
};

type MergePreviewIdentity = {
  id?: number | string;
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

function contactLabel(row: ContactRow): string {
  const name = String(row.display_name || '').trim();
  const email = String(row.primary_email || row.email || '').trim();
  const phone = String(row.primary_phone || row.phone_e164 || '').trim();
  const parts = [name || null, email || null, phone || null].filter(Boolean);
  return parts.length ? parts.join(' | ') : row.id;
}

export default function AdminContactsMerge() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [identities, setIdentities] = useState<IdentityRow[]>([]);
  const [tenantRole, setTenantRole] = useState('');

  const [autoDryRunBusy, setAutoDryRunBusy] = useState(false);
  const [autoExecuteBusy, setAutoExecuteBusy] = useState(false);
  const [autoPlan, setAutoPlan] = useState<Array<{
    from_contact_id: string;
    into_contact_id: string;
    reason: string;
    via_identity_type: string;
    via_identity_value: string;
  }>>([]);

  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('same verified identity');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<MergePreviewState>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const identityMap = useMemo(() => {
    const map = new Map<string, IdentityRow[]>();
    for (const row of identities) {
      const list = map.get(row.contact_id) || [];
      list.push(row);
      map.set(row.contact_id, list);
    }
    for (const [, rows] of map) {
      rows.sort(
        (a, b) => Number(b.is_primary) - Number(a.is_primary)
          || Number(b.verified) - Number(a.verified)
          || b.confidence - a.confidence
      );
    }
    return map;
  }, [identities]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;

    return contacts.filter((row) => {
      const hay = [
        row.display_name,
        row.primary_email,
        row.email,
        row.primary_phone,
        row.phone_e164,
        row.id,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');

      return hay.includes(q);
    });
  }, [contacts, search]);

  const sourceContact = useMemo(() => contacts.find((c) => c.id === sourceId) || null, [contacts, sourceId]);
  const targetContact = useMemo(() => contacts.find((c) => c.id === targetId) || null, [contacts, targetId]);

  const previewBlocks = preview?.ok === true && Boolean(preview.conflicts?.block);
  const previewReasons = preview?.ok === true ? (preview.conflicts?.reasons || []) : [];
  const previewWarnings = preview?.ok === true ? (preview.warnings || []) : [];

  const canMerge = Boolean(tenantId && sourceId && targetId && sourceId !== targetId && !previewBlocks && !previewBusy);
  const isOwner = tenantRole === 'owner';

  const suggestions = useMemo<MergeSuggestion[]>(() => {
    const byIdentity = new Map<string, {
      identity_type: string;
      identity_value: string;
      contactIds: Set<string>;
      hasVerified: boolean;
    }>();

    for (const row of identities) {
      const type = String(row.identity_type || '').toLowerCase();
      if (type !== 'phone' && type !== 'email') continue;

      const value = String(row.identity_value || '').trim();
      if (!value) continue;

      const key = `${type}::${value}`;
      const current = byIdentity.get(key) || {
        identity_type: type,
        identity_value: value,
        contactIds: new Set<string>(),
        hasVerified: false,
      };

      current.contactIds.add(row.contact_id);
      current.hasVerified = current.hasVerified || Boolean(row.verified);
      byIdentity.set(key, current);
    }

    const out: MergeSuggestion[] = [];
    for (const [key, group] of byIdentity.entries()) {
      const ids = Array.from(group.contactIds);
      if (ids.length < 2) continue;

      out.push({
        key,
        identity_type: group.identity_type,
        identity_value: group.identity_value,
        contact_ids: ids,
        strength: group.hasVerified ? 'strong' : 'medium',
      });
    }

    out.sort((a, b) => {
      if (a.strength !== b.strength) return a.strength === 'strong' ? -1 : 1;
      if (a.contact_ids.length !== b.contact_ids.length) return b.contact_ids.length - a.contact_ids.length;
      return a.identity_type.localeCompare(b.identity_type) || a.identity_value.localeCompare(b.identity_value);
    });

    return out.slice(0, 25);
  }, [identities]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      setLoading(true);
      setError('');

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in.');

        const { data: tData, error: tErr } = await supabase
          .from('tenants')
          .select('id,name,created_at')
          .order('created_at', { ascending: false });

        if (tErr) throw tErr;
        if (!mounted) return;

        const nextTenants = (tData || []) as Tenant[];
        setTenants(nextTenants);
        if (nextTenants.length > 0) setTenantId(nextTenants[0].id);
      } catch (e: any) {
        if (mounted) setError(String(e?.message || e));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void boot();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void Promise.all([refresh(tenantId), loadTenantRole(tenantId)]);
  }, [tenantId]);

  useEffect(() => {
    void loadMergePreview(sourceId, targetId, tenantId);
  }, [sourceId, targetId, tenantId]);

  function pickSuggestionPreview(suggestion: MergeSuggestion) {
    const ids = suggestion.contact_ids.filter((id) => contacts.some((c) => c.id === id));
    if (ids.length < 2) return;

    let nextSource = sourceId;
    let nextTarget = targetId;

    if (!nextSource || !ids.includes(nextSource)) nextSource = ids[0];
    if (!nextTarget || nextTarget === nextSource || !ids.includes(nextTarget)) {
      nextTarget = ids.find((id) => id !== nextSource) || ids[1];
    }
    if (nextSource === nextTarget) nextTarget = ids.find((id) => id !== nextSource) || '';

    setSourceId(nextSource || '');
    setTargetId(nextTarget || '');
    setReason(`Suggested merge: same ${suggestion.identity_type} (${suggestion.identity_value})`);
    setSuccess('');
  }

  async function loadTenantRole(currentTenantId = tenantId) {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user?.id) {
      setTenantRole('');
      return;
    }

    const roleRes = await supabase
      .from('tenant_memberships')
      .select('role')
      .eq('tenant_id', currentTenantId)
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (roleRes.error) {
      setTenantRole('');
      return;
    }

    setTenantRole(String(roleRes.data?.role || '').toLowerCase());
  }

  async function refresh(currentTenantId = tenantId) {
    setError('');
    setSuccess('');

    const contactsRes = await supabase
      .from('contacts')
      .select('id,tenant_id,display_name,email,phone_e164,primary_email,primary_phone,merged_into_contact_id,created_at')
      .eq('tenant_id', currentTenantId)
      .is('merged_into_contact_id', null)
      .order('created_at', { ascending: false })
      .limit(500);

    if (contactsRes.error) {
      setError(contactsRes.error.message);
      return;
    }

    const rows = (contactsRes.data || []) as ContactRow[];
    setContacts(rows);

    const ids = rows.map((r) => r.id);
    if (!ids.length) {
      setIdentities([]);
      setSourceId('');
      setTargetId('');
      setPreview(null);
      return;
    }

    const identitiesRes = await supabase
      .from('contact_identities')
      .select('id,contact_id,provider,identity_type,identity_value,is_primary,verified,confidence')
      .eq('tenant_id', currentTenantId)
      .in('contact_id', ids)
      .order('created_at', { ascending: true });

    if (identitiesRes.error) {
      setError(identitiesRes.error.message);
      return;
    }

    setIdentities((identitiesRes.data || []) as IdentityRow[]);

    if (!sourceId || !ids.includes(sourceId)) setSourceId(ids[0] || '');
    if (!targetId || !ids.includes(targetId) || targetId === (ids[0] || '')) {
      const alt = ids.find((id) => id !== (ids[0] || '')) || '';
      setTargetId(alt);
    }
  }

  async function loadMergePreview(fromId = sourceId, intoId = targetId, currentTenantId = tenantId) {
    if (!currentTenantId || !fromId || !intoId || fromId === intoId) {
      setPreview(null);
      return;
    }

    setPreviewBusy(true);

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Missing auth session token');

      const res = await fetch('/.netlify/functions/admin-merge-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: currentTenantId,
          from_contact_id: fromId,
          into_contact_id: intoId,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(String(json?.error || `Preview failed (${res.status})`));
      }

      setPreview(json as MergePreviewData);
    } catch (e: any) {
      setPreview({ ok: false, error: String(e?.message || e) });
    } finally {
      setPreviewBusy(false);
    }
  }

  async function merge() {
    if (!canMerge) {
      if (previewBlocks) {
        const reasonText = previewReasons.length ? previewReasons.join(', ') : 'safety rails';
        setError(`Merge blocked: ${reasonText}`);
      }
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Missing auth session token');

      const res = await fetch('/.netlify/functions/admin-merge-contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          from_contact_id: sourceId,
          into_contact_id: targetId,
          reason: reason.trim() || null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        if (res.status === 409 || json?.error === 'merge_blocked') {
          const reasons = Array.isArray(json?.reasons) ? json.reasons.map((x: any) => String(x)).join(', ') : '';
          throw new Error(reasons ? `Merge blocked: ${reasons}` : 'Merge blocked by safety rails');
        }
        throw new Error(String(json?.error || `Merge failed (${res.status})`));
      }

      const jobId = Number(json?.job_id || 0);
      setSuccess(Number.isInteger(jobId) && jobId > 0 ? `Contacts merged successfully. Job #${jobId}.` : 'Contacts merged successfully.');
      setPreview(null);
      await refresh();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function undoLastMerge() {
    if (!tenantId || !sourceId || !targetId) return;

    setUndoBusy(true);
    setError('');
    setSuccess('');

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Missing auth session token');

      const jobLookup = await supabase
        .from('contact_merge_jobs')
        .select('id,created_at,undone_at')
        .eq('tenant_id', tenantId)
        .eq('from_contact_id', sourceId)
        .eq('into_contact_id', targetId)
        .is('undone_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (jobLookup.error) throw new Error(jobLookup.error.message);
      const jobId = Number(jobLookup.data?.id);
      if (!Number.isInteger(jobId) || jobId <= 0) {
        throw new Error('No active merge job found for this source/target pair.');
      }

      const res = await fetch('/.netlify/functions/admin-merge-undo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          job_id: jobId,
          reason: 'Undo from Contact Merge page',
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(String(json?.error || `Undo failed (${res.status})`));
      }

      setSuccess(`Merge job #${jobId} undone.`);
      await refresh();
      await loadMergePreview(sourceId, targetId, tenantId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setUndoBusy(false);
    }
  }

  async function runAutoMergeDryRun() {
    if (!tenantId) return;

    setAutoDryRunBusy(true);
    setError('');
    setSuccess('');

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Missing auth session token');

      const res = await fetch('/.netlify/functions/admin-auto-merge-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          dry_run: true,
          max_merges: 25,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(String(json?.error || `Dry run failed (${res.status})`));
      }

      const merges = Array.isArray(json?.merges) ? json.merges : [];
      setAutoPlan(merges);
      setSuccess(`Dry run complete. ${merges.length} strong merge(s) planned.`);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setAutoDryRunBusy(false);
    }
  }

  async function executeAutoMerge() {
    if (!tenantId || !autoPlan.length) return;

    setAutoExecuteBusy(true);
    setError('');
    setSuccess('');

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Missing auth session token');

      const res = await fetch('/.netlify/functions/admin-auto-merge-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          dry_run: false,
          max_merges: autoPlan.length,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(String(json?.error || `Auto-merge failed (${res.status})`));
      }

      setSuccess(`Auto-merge done. merged=${json?.merged_count || 0}, failed=${json?.failed_count || 0}.`);
      setAutoPlan([]);
      await Promise.all([refresh(tenantId), loadTenantRole(tenantId)]);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setAutoExecuteBusy(false);
    }
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading contact merge admin...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Contact Merge</h1>
        <p className="text-sm text-slate-400 mt-2">
          Merge duplicate contacts into one canonical profile and preserve all linked identities + conversations.
        </p>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm font-medium">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 rounded-2xl p-4 text-sm font-medium">
          {success}
        </div>
      ) : null}

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter contacts by name, email, phone"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Reason</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Source Contact (merge from)</label>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {filteredContacts.map((row) => (
                <option key={row.id} value={row.id}>{contactLabel(row)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Target Contact (merge into)</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {filteredContacts
                .filter((row) => row.id !== sourceId)
                .map((row) => (
                  <option key={row.id} value={row.id}>{contactLabel(row)}</option>
                ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={merge}
            disabled={saving || !canMerge}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest"
            title={previewBlocks ? `Blocked: ${previewReasons.join(', ')}` : 'Merge contacts'}
          >
            {saving ? 'Merging...' : 'Merge Contacts'}
          </button>

          <button
            onClick={undoLastMerge}
            disabled={undoBusy || !tenantId || !sourceId || !targetId}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest"
            title="Undo latest active merge for this source/target pair"
          >
            {undoBusy ? 'Undoing...' : 'Undo Last Merge'}
          </button>

          <button
            onClick={() => refresh()}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase tracking-widest"
          >
            Refresh
          </button>

          {previewBlocks ? (
            <div className="text-xs text-red-300">Blocked: {previewReasons.join(', ')}</div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-black uppercase tracking-widest text-slate-300">Merge Preview</div>
            <div className="text-xs text-slate-500">{previewBusy ? 'Loading...' : ''}</div>
          </div>

          {!sourceId || !targetId || sourceId === targetId ? (
            <div className="text-sm text-slate-400">Select source + target to preview merge.</div>
          ) : !preview ? (
            <div className="text-sm text-slate-400">Waiting for preview...</div>
          ) : preview.ok === false ? (
            <div className="text-sm text-red-300">{preview.error || 'Preview failed'}</div>
          ) : (
            <>
              {preview.conflicts?.block ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
                  <div className="text-sm font-black uppercase tracking-wider text-red-200">Merge blocked</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-red-100">
                    {(preview.conflicts.reasons || []).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  No blocking conflicts detected.
                </div>
              )}

              {previewWarnings.length > 0 ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                  <div className="text-sm font-black uppercase tracking-wider text-amber-200">Warnings</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-amber-100">
                    {previewWarnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.summary ? (
                <div className="space-y-1 text-sm text-slate-300">
                  <div>
                    <span className="font-semibold">Will move:</span> {preview.summary.move.identities_to_move} identities, {preview.summary.move.conversations_to_move} conversations
                  </div>
                  <div>
                    <span className="font-semibold">Overlap:</span> {preview.identity_overlap.exact_matches.length} identities already exist on target
                  </div>
                </div>
              ) : null}

              <details className="rounded-xl border border-white/10 bg-black/20 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-200">Identity diff</summary>
                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <MergePreviewIdentityList
                    title="From-only (will move)"
                    rows={preview.identity_overlap.from_only}
                    emptyText="No from-only identities."
                  />
                  <MergePreviewIdentityList
                    title="Exact matches (already on target)"
                    rows={preview.identity_overlap.exact_matches}
                    emptyText="No exact identity matches."
                  />
                </div>
              </details>
            </>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 text-sm font-black uppercase tracking-widest text-slate-300">
          Suggested Merges
        </div>

        <div className="px-6 py-4 border-b border-white/10 bg-black/20 flex flex-wrap items-center gap-3">
          <button
            onClick={runAutoMergeDryRun}
            disabled={autoDryRunBusy || !isOwner}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-black uppercase tracking-widest"
            title={isOwner ? 'Compute strong auto-merge plan' : 'Owner role required'}
          >
            {autoDryRunBusy ? 'Running Dry Run...' : 'Dry Run Strong Auto-Merge'}
          </button>

          <button
            onClick={executeAutoMerge}
            disabled={autoExecuteBusy || !isOwner || autoPlan.length === 0}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-black uppercase tracking-widest"
            title={!isOwner ? 'Owner role required' : autoPlan.length === 0 ? 'Run dry run first' : 'Execute planned merges'}
          >
            {autoExecuteBusy ? 'Executing...' : `Execute Planned (${autoPlan.length})`}
          </button>

          <div className="text-xs text-slate-400">
            Role: <span className="font-mono text-slate-300">{tenantRole || 'unknown'}</span>
          </div>
        </div>

        {suggestions.length === 0 ? (
          <div className="px-6 py-5 text-sm text-slate-400">No phone/email overlap detected across unmerged contacts.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {suggestions.map((s) => (
              <div key={s.key} className="px-6 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-100">
                    {s.identity_type} <span className="font-mono text-slate-300">{s.identity_value}</span>
                  </div>
                  <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                    <span>{s.contact_ids.length} contacts</span>
                    <span className={s.strength === 'strong'
                      ? 'inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-200'
                      : 'inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-200'}
                    >
                      {s.strength === 'strong' ? 'Strong' : 'Medium'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {s.contact_ids.slice(0, 3).map((id) => (
                    <span key={id} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 font-mono text-[10px] text-slate-300">
                      {id.slice(0, 8)}...
                    </span>
                  ))}

                  <button
                    onClick={() => pickSuggestionPreview(s)}
                    className={s.strength === 'strong'
                      ? 'px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-black uppercase tracking-widest text-emerald-100'
                      : 'px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-black uppercase tracking-widest text-amber-100'}
                  >
                    Preview
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {autoPlan.length > 0 ? (
          <div className="border-t border-white/10">
            <div className="px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-400">
              Dry Run Plan ({autoPlan.length})
            </div>
            <div className="divide-y divide-white/5">
              {autoPlan.slice(0, 20).map((m, i) => (
                <div key={`${m.from_contact_id}:${m.into_contact_id}:${i}`} className="px-6 py-3 text-xs text-slate-300 flex flex-wrap items-center gap-2">
                  <span className="font-mono">{m.from_contact_id.slice(0, 8)}...</span>
                  <span>-&gt;</span>
                  <span className="font-mono">{m.into_contact_id.slice(0, 8)}...</span>
                  <span className="text-slate-500">via {m.via_identity_type}</span>
                  <span className="font-mono text-slate-400">{m.via_identity_value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ContactPanel title="Source" contact={sourceContact} identities={identityMap.get(sourceId) || []} />
        <ContactPanel title="Target" contact={targetContact} identities={identityMap.get(targetId) || []} />
      </div>
    </div>
  );
}

function MergePreviewIdentityList({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: MergePreviewIdentity[];
  emptyText: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-500">{emptyText}</div>
      ) : (
        <div className="space-y-2 max-h-56 overflow-auto pr-1">
          {rows.map((row, index) => (
            <div
              key={`${row.provider}:${row.identity_type}:${row.identity_value}:${row.channel_account_id || 'null'}:${index}`}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
            >
              <div className="font-mono text-[11px] text-slate-200">{row.provider}:{row.identity_type}</div>
              <div className="font-mono text-[11px] text-slate-300 break-all">{row.identity_value}</div>
              <div className="mt-1 text-[10px] text-slate-500">
                confidence {Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0}
                {' | '}verified {row.verified ? 'true' : 'false'}
                {' | '}primary {row.is_primary ? 'true' : 'false'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactPanel({
  title,
  contact,
  identities,
}: {
  title: string;
  contact: ContactRow | null;
  identities: IdentityRow[];
}) {
  return (
    <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
      <h2 className="text-lg font-black uppercase tracking-tight">{title}</h2>
      {contact ? (
        <div className="mt-3 space-y-2">
          <div className="text-sm font-semibold">{contactLabel(contact)}</div>
          <div className="text-xs text-slate-400 font-mono">{contact.id}</div>
        </div>
      ) : (
        <div className="mt-3 text-sm text-slate-400">Select a contact.</div>
      )}

      <div className="mt-4 border-t border-white/10 pt-4 space-y-2">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400">Identities</div>
        {identities.length === 0 ? (
          <div className="text-xs text-slate-500">No identities found.</div>
        ) : (
          <div className="space-y-2">
            {identities.map((row) => (
              <div key={row.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                <div className="font-mono text-slate-100">{row.provider}:{row.identity_type}</div>
                <div className="font-mono text-slate-300 break-all">{row.identity_value}</div>
                <div className="text-slate-400 mt-1">
                  confidence {row.confidence}
                  {' | '}verified {row.verified ? 'true' : 'false'}
                  {' | '}primary {row.is_primary ? 'true' : 'false'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
