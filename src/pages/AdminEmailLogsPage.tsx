import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

type Tenant = { id: string; name: string | null };

type MessageRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  to_email: string;
  message_type: string;
  subject: string;
  template_key: string | null;
  provider: string;
  provider_message_id: string | null;
  status: string;
  error: string | null;
  created_at: string;
};

export default function AdminEmailLogsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [rows, setRows] = useState<MessageRow[]>([]);

  async function loadLogs(nextTenantId: string) {
    if (!nextTenantId) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError('');

    let query = supabase
      .from('esp_messages')
      .select('id,tenant_id,user_id,to_email,message_type,subject,template_key,provider,provider_message_id,status,error,created_at')
      .eq('tenant_id', nextTenantId)
      .order('created_at', { ascending: false })
      .limit(300);

    if (providerFilter !== 'all') {
      query = query.eq('provider', providerFilter);
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (typeFilter !== 'all') {
      query = query.eq('message_type', typeFilter);
    }

    const { data, error: readError } = await query;

    if (readError) {
      setError(readError.message || 'Unable to load email logs.');
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data || []) as MessageRow[]);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    async function boot() {
      if (!isSuperAdmin) {
        setLoading(false);
        return;
      }

      const { data, error: tenantError } = await supabase
        .from('tenants')
        .select('id,name')
        .order('name', { ascending: true });

      if (!active) return;

      if (tenantError) {
        setError(tenantError.message || 'Unable to load tenants.');
        setLoading(false);
        return;
      }

      const nextTenants = (data || []) as Tenant[];
      setTenants(nextTenants);
      const firstTenantId = nextTenants[0]?.id || '';
      setTenantId(firstTenantId);
      await loadLogs(firstTenantId);
    }

    void boot();

    return () => {
      active = false;
    };
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!tenantId) return;
    void loadLogs(tenantId);
  }, [tenantId, providerFilter, statusFilter, typeFilter]);

  const statusOptions = useMemo(() => {
    const base = ['all'];
    const fromData = Array.from(new Set(rows.map((row) => row.status))).sort();
    return [...base, ...fromData];
  }, [rows]);

  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Super admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading email logs...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Email Logs</h1>
        <p className="text-sm text-slate-400 mt-1">Filter provider delivery attempts and failure reasons.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Tenant</label>
          <select
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Provider</label>
          <select
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          >
            <option value="all">all</option>
            <option value="brevo">brevo</option>
            <option value="mailerlite">mailerlite</option>
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Status</label>
          <select
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Message Type</label>
          <select
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">all</option>
            <option value="transactional">transactional</option>
            <option value="billing">billing</option>
            <option value="system">system</option>
            <option value="onboarding">onboarding</option>
            <option value="reminders">reminders</option>
            <option value="marketing">marketing</option>
            <option value="newsletter">newsletter</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">To</th>
                <th className="px-4 py-3 text-left">Subject</th>
                <th className="px-4 py-3 text-left">Provider</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Provider Message</th>
                <th className="px-4 py-3 text-left">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-xs text-slate-300">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs uppercase tracking-wider text-slate-200">{row.message_type}</td>
                  <td className="px-4 py-3 text-xs text-slate-200">{row.to_email}</td>
                  <td className="px-4 py-3 text-xs text-slate-300 max-w-[280px] truncate">{row.subject}</td>
                  <td className="px-4 py-3 text-xs uppercase text-cyan-300">{row.provider}</td>
                  <td className="px-4 py-3 text-xs text-slate-200">{row.status}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-400">{row.provider_message_id || '-'}</td>
                  <td className="px-4 py-3 text-xs text-rose-300 max-w-[260px] truncate">{row.error || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
