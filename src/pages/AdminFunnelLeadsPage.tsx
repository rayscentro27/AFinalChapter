import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { FunnelLeadRow, LeadEventRow, listFunnelLeads, listLeadEvents } from '../services/funnelService';

type Tenant = {
  id: string;
  name: string | null;
};

function pretty(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminFunnelLeadsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');

  const [leads, setLeads] = useState<FunnelLeadRow[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [timeline, setTimeline] = useState<LeadEventRow[]>([]);

  const [statusFilter, setStatusFilter] = useState('all');
  const [optInFilter, setOptInFilter] = useState('all');
  const [query, setQuery] = useState('');

  async function loadTenants() {
    const res = await supabase.from('tenants').select('id,name').order('name', { ascending: true });
    if (res.error) throw new Error(res.error.message || 'Unable to load tenants.');
    const rows = (res.data || []) as Tenant[];
    setTenants(rows);
    setTenantId((prev) => prev || rows[0]?.id || '');
  }

  async function loadLeads(nextTenantId: string) {
    if (!nextTenantId) {
      setLeads([]);
      setTimeline([]);
      setSelectedLeadId('');
      return;
    }

    const rows = await listFunnelLeads(nextTenantId);
    setLeads(rows);

    const selected = rows.find((row) => row.id === selectedLeadId) || rows[0] || null;
    const nextLeadId = selected?.id || '';
    setSelectedLeadId(nextLeadId);

    if (nextLeadId) {
      const events = await listLeadEvents(nextLeadId);
      setTimeline(events);
    } else {
      setTimeline([]);
    }
  }

  useEffect(() => {
    let active = true;

    async function boot() {
      if (!isAdmin) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        await loadTenants();
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
  }, [isAdmin]);

  useEffect(() => {
    if (!tenantId) return;
    void loadLeads(tenantId).catch((e: any) => setError(String(e?.message || e)));
  }, [tenantId]);

  useEffect(() => {
    if (!selectedLeadId) return;
    void listLeadEvents(selectedLeadId).then(setTimeline).catch((e: any) => setError(String(e?.message || e)));
  }, [selectedLeadId]);

  const filteredLeads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
      if (optInFilter === 'opted_in' && !lead.marketing_opt_in) return false;
      if (optInFilter === 'not_opted_in' && lead.marketing_opt_in) return false;
      if (needle && !`${lead.email} ${lead.first_name || ''} ${lead.last_name || ''} ${lead.source || ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [leads, query, statusFilter, optInFilter]);

  if (!isAdmin) {
    return <div className="mx-auto max-w-3xl px-4 py-8 text-slate-100"><div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Super admin access required.</div></div>;
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading funnel leads...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Funnel Leads</h1>
        <p className="text-sm text-slate-400 mt-1">View lead status, consent posture, and lead-event timeline.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Tenant</label>
          <select className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Status</label>
          <select className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">all</option>
            <option value="new">new</option>
            <option value="nurturing">nurturing</option>
            <option value="converted">converted</option>
            <option value="unsubscribed">unsubscribed</option>
            <option value="dead">dead</option>
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Opt-in</label>
          <select className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={optInFilter} onChange={(e) => setOptInFilter(e.target.value)}>
            <option value="all">all</option>
            <option value="opted_in">opted in</option>
            <option value="not_opted_in">not opted in</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Search</label>
          <input className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm" placeholder="email, name, source" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Lead</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Marketing Opt-In</th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className={lead.id === selectedLeadId ? 'bg-slate-800/40' : 'hover:bg-slate-800/20'} onClick={() => setSelectedLeadId(lead.id)}>
                    <td className="px-4 py-3 text-slate-200">
                      <div className="font-semibold">{lead.email}</div>
                      <div className="text-xs text-slate-500">{`${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs uppercase tracking-wider text-cyan-300">{lead.status}</td>
                    <td className="px-4 py-3 text-xs text-slate-200">{lead.marketing_opt_in ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-xs text-slate-300">{lead.source || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{new Date(lead.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {filteredLeads.length === 0 ? <tr><td className="px-4 py-4 text-slate-400" colSpan={5}>No leads found for the filters.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
          <h2 className="text-lg font-semibold text-white">Lead Timeline</h2>
          <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
            {timeline.map((event) => (
              <div key={event.id} className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                <div className="text-xs uppercase tracking-wider text-cyan-300">{pretty(event.event_type)}</div>
                <div className="mt-1 text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</div>
                <pre className="mt-2 whitespace-pre-wrap text-[11px] text-slate-300">{JSON.stringify(event.payload || {}, null, 2)}</pre>
              </div>
            ))}
            {timeline.length === 0 ? <div className="text-sm text-slate-400">No events for this lead.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
