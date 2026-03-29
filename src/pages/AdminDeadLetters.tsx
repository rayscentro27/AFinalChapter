import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

type DeadLetterRow = {
  id: number;
  tenant_id: string | null;
  provider: string;
  endpoint: string;
  error: string | null;
  attempts: number;
  next_retry_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

export default function AdminDeadLetters() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>('all');
  const [rows, setRows] = useState<DeadLetterRow[]>([]);

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      setError('');
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in.');

        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('id,name,created_at')
          .order('created_at', { ascending: false });

        if (tenantError) throw tenantError;
        if (!active) return;

        setTenants((tenantData || []) as Tenant[]);
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
    if (!loading) {
      void load();
    }
  }, [tenantId, loading]);

  async function load() {
    setError('');

    let query: any = supabase
      .from('webhook_dead_letters')
      .select('id,tenant_id,provider,endpoint,error,attempts,next_retry_at,resolved_at,created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (tenantId !== 'all') query = query.eq('tenant_id', tenantId);

    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
      return;
    }

    setRows((data || []) as DeadLetterRow[]);
  }

  async function retry(id: number) {
    try {
      setBusyId(id);
      setError('');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Sign in required.');

      const response = await fetch('/.netlify/functions/deadletter-retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as any)?.error || `Retry failed (${response.status})`));
      }

      await load();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  async function resolveDeadLetter(id: number) {
    const { error: updateError } = await supabase
      .from('webhook_dead_letters')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await load();
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading dead letters...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Webhook Dead Letters</h1>
        <p className="text-sm text-slate-400 mt-2">
          Review and replay failed webhook payloads. This view is intended for tenant owners/admins.
        </p>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm font-medium">
          {error}
        </div>
      ) : null}

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Tenant</label>
            <select
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              <option value="all">All accessible tenants</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => void load()}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Latest 200</h2>
          <span className="text-xs text-slate-500">{rows.length} records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-400">
                <th className="px-6 py-3">ID</th>
                <th className="px-6 py-3">Provider</th>
                <th className="px-6 py-3">Endpoint</th>
                <th className="px-6 py-3">Attempts</th>
                <th className="px-6 py-3">Next Retry</th>
                <th className="px-6 py-3">Resolved</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-slate-400">No dead letters found.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-white/5 align-top">
                    <td className="px-6 py-4 font-mono text-xs text-slate-200">{row.id}</td>
                    <td className="px-6 py-4 text-slate-200">{row.provider}</td>
                    <td className="px-6 py-4 text-slate-300">{row.endpoint}</td>
                    <td className="px-6 py-4 text-slate-300">{row.attempts}</td>
                    <td className="px-6 py-4 text-slate-300">
                      {row.next_retry_at ? new Date(row.next_retry_at).toLocaleString() : '-'}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {row.resolved_at ? new Date(row.resolved_at).toLocaleString() : '-'}
                    </td>
                    <td className="px-6 py-4 space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => void retry(row.id)}
                        disabled={busyId === row.id || Boolean(row.resolved_at)}
                        className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-black uppercase tracking-wider disabled:opacity-40"
                      >
                        {busyId === row.id ? 'Retrying...' : 'Retry'}
                      </button>
                      <button
                        onClick={() => void resolveDeadLetter(row.id)}
                        disabled={Boolean(row.resolved_at)}
                        className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-black uppercase tracking-wider disabled:opacity-40"
                      >
                        Resolve
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
