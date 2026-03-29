import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

type OutboxRow = {
  id: number;
  tenant_id: string;
  provider: string;
  conversation_id: string;
  to_address: string;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  created_at: string;
};

export default function AdminOutbox() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [rows, setRows] = useState<OutboxRow[]>([]);

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

        const list = (tenantData || []) as Tenant[];
        setTenants(list);
        if (list.length > 0) setTenantId((prev) => prev || list[0].id);
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
    if (!loading && tenantId) {
      void load();
    }
  }, [tenantId, loading]);

  async function load() {
    if (!tenantId) return;
    setError('');

    const { data, error: queryError } = await supabase
      .from('outbox_messages')
      .select('id,tenant_id,provider,conversation_id,to_address,status,attempts,next_attempt_at,provider_message_id,last_error,created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(250);

    if (queryError) {
      setError(queryError.message);
      return;
    }

    setRows((data || []) as OutboxRow[]);
  }

  async function runWorker() {
    if (!tenantId) return;

    try {
      setBusy(true);
      setError('');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Sign in required.');

      const response = await fetch('/.netlify/functions/outbox-worker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenant_id: tenantId, limit: 50 }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as any)?.error || `Outbox worker failed (${response.status})`));
      }

      await load();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function retryNow(id: number) {
    const { error: updateError } = await supabase
      .from('outbox_messages')
      .update({
        status: 'queued',
        next_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await load();
  }

  async function cancel(id: number) {
    const { error: updateError } = await supabase
      .from('outbox_messages')
      .update({
        status: 'canceled',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await load();
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading outbox...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Outbox</h1>
        <p className="text-sm text-slate-400 mt-2">
          Idempotent outbound queue with retry controls.
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

          <div className="flex items-end">
            <button
              onClick={() => void runWorker()}
              disabled={busy || !tenantId}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
            >
              {busy ? 'Running...' : 'Run worker'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Latest 250</h2>
          <span className="text-xs text-slate-500">{rows.length} rows</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-400">
                <th className="px-6 py-3">ID</th>
                <th className="px-6 py-3">Provider</th>
                <th className="px-6 py-3">To</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Attempts</th>
                <th className="px-6 py-3">Next</th>
                <th className="px-6 py-3">Provider Msg ID</th>
                <th className="px-6 py-3">Error</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-slate-400">No outbox rows found.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-white/5 align-top">
                    <td className="px-6 py-4 font-mono text-xs text-slate-200">{row.id}</td>
                    <td className="px-6 py-4 text-slate-200">{row.provider}</td>
                    <td className="px-6 py-4 text-slate-300">{row.to_address}</td>
                    <td className="px-6 py-4 text-slate-300">{row.status}</td>
                    <td className="px-6 py-4 text-slate-300">{row.attempts}</td>
                    <td className="px-6 py-4 text-slate-300">
                      {row.next_attempt_at ? new Date(row.next_attempt_at).toLocaleString() : '-'}
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-mono text-xs">
                      {row.provider_message_id || '-'}
                    </td>
                    <td className="px-6 py-4 text-slate-300 max-w-[360px] truncate" title={row.last_error || ''}>
                      {row.last_error || '-'}
                    </td>
                    <td className="px-6 py-4 space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => void retryNow(row.id)}
                        disabled={row.status === 'sending'}
                        className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-black uppercase tracking-wider disabled:opacity-40"
                      >
                        Retry now
                      </button>
                      <button
                        onClick={() => void cancel(row.id)}
                        disabled={row.status === 'sent' || row.status === 'canceled'}
                        className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-black uppercase tracking-wider disabled:opacity-40"
                      >
                        Cancel
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
