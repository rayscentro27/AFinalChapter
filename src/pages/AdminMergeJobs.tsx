import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

type MergeJob = {
  id: number;
  tenant_id: string;
  from_contact_id: string;
  into_contact_id: string;
  merged_by?: string | null;
  reason?: string | null;
  created_at: string;
  undone_at?: string | null;
  undone_by?: string | null;
};

type JobItem = {
  id: number;
  job_id: number;
  item_type: string;
  item_id: string;
  snapshot?: any;
  created_at?: string;
};

type ContactRow = {
  id: string;
  display_name?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
};

function contactLabel(row?: ContactRow | null, fallbackId?: string): string {
  if (!row) return String(fallbackId || 'unknown');
  const name = String(row.display_name || '').trim();
  const email = String(row.primary_email || '').trim();
  const phone = String(row.primary_phone || '').trim();
  const parts = [name || null, email || null, phone || null].filter(Boolean);
  return parts.length ? parts.join(' | ') : String(fallbackId || row.id);
}

export default function AdminMergeJobs() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');

  const [jobs, setJobs] = useState<MergeJob[]>([]);
  const [jobItems, setJobItems] = useState<JobItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [contactsById, setContactsById] = useState<Record<string, ContactRow>>({});

  const [activeOnly, setActiveOnly] = useState(true);
  const [search, setSearch] = useState('');
  const [undoBusy, setUndoBusy] = useState(false);

  const itemCounts = useMemo(() => {
    const map = new Map<number, { identities: number; conversations: number; total: number }>();
    for (const item of jobItems) {
      const current = map.get(item.job_id) || { identities: 0, conversations: 0, total: 0 };
      current.total += 1;
      if (item.item_type === 'identity') current.identities += 1;
      if (item.item_type === 'conversation') current.conversations += 1;
      map.set(item.job_id, current);
    }
    return map;
  }, [jobItems]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();

    return jobs.filter((job) => {
      if (activeOnly && job.undone_at) return false;
      if (!q) return true;

      const fromLabel = contactLabel(contactsById[job.from_contact_id], job.from_contact_id).toLowerCase();
      const intoLabel = contactLabel(contactsById[job.into_contact_id], job.into_contact_id).toLowerCase();

      const haystack = [
        String(job.id),
        job.from_contact_id,
        job.into_contact_id,
        fromLabel,
        intoLabel,
        String(job.reason || ''),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [activeOnly, contactsById, jobs, search]);

  const selectedJob = useMemo(
    () => filteredJobs.find((job) => job.id === selectedJobId) || null,
    [filteredJobs, selectedJobId]
  );

  const selectedJobItems = useMemo(
    () => jobItems
      .filter((item) => selectedJob && item.job_id === selectedJob.id)
      .sort((a, b) => a.id - b.id),
    [jobItems, selectedJob]
  );

  useEffect(() => {
    let mounted = true;

    async function boot() {
      setLoading(true);
      setError('');

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in.');

        const { data: tenantRows, error: tenantErr } = await supabase
          .from('tenants')
          .select('id,name,created_at')
          .order('created_at', { ascending: false });

        if (tenantErr) throw tenantErr;
        if (!mounted) return;

        const nextTenants = (tenantRows || []) as Tenant[];
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
    void refresh(tenantId);
  }, [tenantId]);

  useEffect(() => {
    if (selectedJobId != null && !filteredJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(filteredJobs[0]?.id || null);
    }
  }, [filteredJobs, selectedJobId]);

  async function refresh(currentTenantId = tenantId) {
    setError('');
    setSuccess('');

    const jobsRes = await supabase
      .from('contact_merge_jobs')
      .select('id,tenant_id,from_contact_id,into_contact_id,merged_by,reason,created_at,undone_at,undone_by')
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (jobsRes.error) {
      setError(jobsRes.error.message);
      return;
    }

    const nextJobs = (jobsRes.data || []) as MergeJob[];
    setJobs(nextJobs);

    if (!nextJobs.length) {
      setJobItems([]);
      setContactsById({});
      setSelectedJobId(null);
      return;
    }

    const jobIds = nextJobs.map((job) => job.id);
    const itemsRes = await supabase
      .from('contact_merge_job_items')
      .select('id,job_id,item_type,item_id,snapshot,created_at')
      .eq('tenant_id', currentTenantId)
      .in('job_id', jobIds)
      .limit(5000);

    if (itemsRes.error) {
      setError(itemsRes.error.message);
      return;
    }

    setJobItems((itemsRes.data || []) as JobItem[]);

    const contactIds = Array.from(
      new Set(
        nextJobs.flatMap((job) => [job.from_contact_id, job.into_contact_id]).filter(Boolean)
      )
    );

    if (contactIds.length > 0) {
      const contactsRes = await supabase
        .from('contacts')
        .select('id,display_name,primary_email,primary_phone')
        .eq('tenant_id', currentTenantId)
        .in('id', contactIds);

      if (contactsRes.error) {
        setError(contactsRes.error.message);
        return;
      }

      const map: Record<string, ContactRow> = {};
      for (const row of (contactsRes.data || []) as ContactRow[]) {
        map[row.id] = row;
      }
      setContactsById(map);
    } else {
      setContactsById({});
    }

    setSelectedJobId((prev) => {
      if (prev && nextJobs.some((job) => job.id === prev)) return prev;
      return nextJobs[0]?.id || null;
    });
  }

  async function undoJob(job: MergeJob) {
    if (!tenantId || !job?.id || job.undone_at) return;

    setUndoBusy(true);
    setError('');
    setSuccess('');

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Missing auth session token');

      const res = await fetch('/.netlify/functions/admin-merge-undo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          job_id: job.id,
          reason: 'Undo from Merge Jobs page',
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(String(json?.error || `Undo failed (${res.status})`));
      }

      setSuccess(`Merge job #${job.id} undone.`);
      await refresh(tenantId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setUndoBusy(false);
    }
  }

  if (loading) {
    return <div className="max-w-7xl mx-auto p-6 text-slate-200">Loading merge jobs...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Merge Jobs</h1>
        <p className="text-sm text-slate-400 mt-2">Auditable merge history with item-level snapshots and undo support.</p>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm font-medium">{error}</div>
      ) : null}

      {success ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 rounded-2xl p-4 text-sm font-medium">{success}</div>
      ) : null}

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
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
              placeholder="Search by contact id, display name, or reason"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
          </div>

          <div className="flex items-end gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="rounded border-white/20 bg-black/30"
              />
              Active only
            </label>

            <button
              onClick={() => refresh()}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase tracking-widest"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 text-sm font-black uppercase tracking-widest text-slate-300">
            Jobs ({filteredJobs.length})
          </div>

          {filteredJobs.length === 0 ? (
            <div className="p-6 text-sm text-slate-400">No merge jobs found for this filter.</div>
          ) : (
            <div className="divide-y divide-white/5 max-h-[70vh] overflow-auto">
              {filteredJobs.map((job) => {
                const counts = itemCounts.get(job.id) || { identities: 0, conversations: 0, total: 0 };
                const from = contactsById[job.from_contact_id];
                const into = contactsById[job.into_contact_id];
                const isSelected = selectedJobId === job.id;

                return (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    className={`w-full text-left px-6 py-4 ${isSelected ? 'bg-blue-500/10' : 'hover:bg-white/5'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-100">Job #{job.id}</div>
                      <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${job.undone_at ? 'border-slate-600 text-slate-400' : 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'}`}>
                        {job.undone_at ? 'Undone' : 'Active'}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{new Date(job.created_at).toLocaleString()}</div>
                    <div className="mt-2 text-xs text-slate-300">From: {contactLabel(from, job.from_contact_id)}</div>
                    <div className="text-xs text-slate-300">Into: {contactLabel(into, job.into_contact_id)}</div>
                    <div className="mt-2 text-xs text-slate-500">identities {counts.identities} • conversations {counts.conversations}</div>
                    {job.reason ? <div className="mt-2 text-xs text-slate-400">Reason: {job.reason}</div> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 text-sm font-black uppercase tracking-widest text-slate-300">
            Job Detail
          </div>

          {!selectedJob ? (
            <div className="p-6 text-sm text-slate-400">Select a merge job to view details.</div>
          ) : (
            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-black">Job #{selectedJob.id}</div>
                  <div className="text-xs text-slate-400">Created {new Date(selectedJob.created_at).toLocaleString()}</div>
                </div>
                <button
                  onClick={() => void undoJob(selectedJob)}
                  disabled={undoBusy || Boolean(selectedJob.undone_at)}
                  className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-xs font-black uppercase tracking-widest"
                >
                  {undoBusy ? 'Undoing...' : selectedJob.undone_at ? 'Already Undone' : 'Undo'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm">
                <div><span className="text-slate-400">From:</span> {contactLabel(contactsById[selectedJob.from_contact_id], selectedJob.from_contact_id)}</div>
                <div><span className="text-slate-400">Into:</span> {contactLabel(contactsById[selectedJob.into_contact_id], selectedJob.into_contact_id)}</div>
                <div><span className="text-slate-400">Reason:</span> {selectedJob.reason || 'n/a'}</div>
                <div><span className="text-slate-400">Status:</span> {selectedJob.undone_at ? `Undone at ${new Date(selectedJob.undone_at).toLocaleString()}` : 'Active'}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Moved Items ({selectedJobItems.length})</div>

                {selectedJobItems.length === 0 ? (
                  <div className="text-xs text-slate-500">No job items found.</div>
                ) : (
                  <div className="max-h-[42vh] overflow-auto divide-y divide-white/5">
                    {selectedJobItems.map((item) => (
                      <div key={item.id} className="py-2 text-xs text-slate-300">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-slate-200">{item.item_type}:{item.item_id}</span>
                          <span className="text-slate-500">#{item.id}</span>
                        </div>

                        {item.item_type === 'identity' && item.snapshot ? (
                          <div className="mt-1 text-slate-400">
                            {(item.snapshot.provider || 'unknown')}:{(item.snapshot.identity_type || 'unknown')}:{(item.snapshot.identity_value || 'unknown')}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
