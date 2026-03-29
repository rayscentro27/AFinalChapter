import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { authorizeAndSendDocuPost } from '../services/docupostMailService';

type MailingEventRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  dispute_packet_id: string;
  provider: string;
  status: 'queued' | 'submitted' | 'sent' | 'failed' | 'canceled';
  provider_reference_id: string | null;
  to_name: string;
  to_address_1: string;
  to_address_2: string | null;
  to_city: string;
  to_state: string;
  to_zip: string;
  document_hash: string;
  cost_cents: number | null;
  created_at: string;
  updated_at: string;
};

type AuditEventRow = {
  id: number;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const STATUS_FILTERS = ['all', 'queued', 'submitted', 'sent', 'failed', 'canceled'] as const;

export default function AdminMailingDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [events, setEvents] = useState<MailingEventRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      if (!user?.id) {
        if (!active) return;
        setIsAdmin(false);
        setCheckingAccess(false);
        return;
      }

      setCheckingAccess(true);
      const { data, error: accessError } = await supabase.rpc('nexus_is_master_admin_compat');

      if (!active) return;
      if (accessError) {
        setIsAdmin(user.role === 'admin');
      } else {
        setIsAdmin(Boolean(data));
      }

      setCheckingAccess(false);
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [user?.id, user?.role]);

  async function loadData() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const [eventsRes, auditRes] = await Promise.all([
      supabase
        .from('mailing_events')
        .select('id,tenant_id,user_id,dispute_packet_id,provider,status,provider_reference_id,to_name,to_address_1,to_address_2,to_city,to_state,to_zip,document_hash,cost_cents,created_at,updated_at')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('audit_events')
        .select('id,event_type,metadata,created_at')
        .in('event_type', ['DOCUPOST_SUBMIT', 'DOCUPOST_WEBHOOK'])
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (eventsRes.error) {
      setError(eventsRes.error.message || 'Unable to load mailing events.');
      setEvents([]);
      setLoading(false);
      return;
    }

    if (auditRes.error) {
      setError(auditRes.error.message || 'Unable to load mailing audit trail.');
      setAuditEvents([]);
    } else {
      setAuditEvents((auditRes.data || []) as AuditEventRow[]);
    }

    setEvents((eventsRes.data || []) as MailingEventRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (checkingAccess || !isAdmin) {
      setLoading(false);
      return;
    }
    void loadData();
  }, [checkingAccess, isAdmin]);

  const filteredEvents = useMemo(() => {
    if (statusFilter === 'all') return events;
    return events.filter((event) => event.status === statusFilter);
  }, [events, statusFilter]);

  const auditByEventId = useMemo(() => {
    const map = new Map<string, AuditEventRow[]>();

    for (const item of auditEvents) {
      const mailingEventId = String(item.metadata?.mailing_event_id || '').trim();
      if (!mailingEventId) continue;

      const next = map.get(mailingEventId) || [];
      next.push(item);
      map.set(mailingEventId, next);
    }

    return map;
  }, [auditEvents]);

  async function retryEvent(event: MailingEventRow) {
    if (!user?.id) return;

    if (event.user_id !== user.id) {
      setError('Retry is owner-only in this phase. Ask the packet owner to re-authorize and resend.');
      return;
    }

    setBusyId(event.id);
    setError('');
    setSuccess('');

    try {
      const result = await authorizeAndSendDocuPost({
        dispute_packet_id: event.dispute_packet_id,
        to_name: event.to_name,
        to_address_1: event.to_address_1,
        to_address_2: event.to_address_2 || undefined,
        to_city: event.to_city,
        to_state: event.to_state,
        to_zip: event.to_zip,
      });

      setSuccess(`Retry queued with status ${result.status}.`);
      await loadData();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying admin access...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading DocuPost dashboard...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Admin Mailing Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">DocuPost mailing events, provider references, retry controls, and audit trail.</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_FILTERS)[number])}
          className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm"
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>{status.toUpperCase()}</option>
          ))}
        </select>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-sm">
            <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Event</th>
                <th className="px-4 py-3 text-left">Packet</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Provider Ref</th>
                <th className="px-4 py-3 text-left">Cost</th>
                <th className="px-4 py-3 text-left">Audit Trail</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredEvents.map((event) => {
                const trail = auditByEventId.get(event.id) || [];
                return (
                  <tr key={event.id}>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-slate-200">{event.id}</p>
                      <p className="text-xs text-slate-500 mt-1">{new Date(event.created_at).toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-slate-200">{event.dispute_packet_id}</p>
                      <p className="text-xs text-slate-500 mt-1">User: {event.user_id.slice(0, 8)}...</p>
                    </td>
                    <td className="px-4 py-3 text-cyan-300 font-semibold uppercase tracking-wide">{event.status}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs font-mono">{event.provider_reference_id || '-'}</td>
                    <td className="px-4 py-3 text-slate-300">{event.cost_cents != null ? `$${(event.cost_cents / 100).toFixed(2)}` : '-'}</td>
                    <td className="px-4 py-3">
                      {trail.length === 0 ? (
                        <span className="text-xs text-slate-500">No entries</span>
                      ) : (
                        <div className="space-y-1">
                          {trail.slice(0, 2).map((item) => (
                            <div key={item.id} className="text-xs text-slate-300">
                              <span className="text-cyan-300 font-semibold">{item.event_type}</span> · {new Date(item.created_at).toLocaleString()}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void retryEvent(event)}
                        disabled={busyId !== null || event.status !== 'failed' || event.user_id !== user?.id}
                        className="rounded-lg bg-cyan-500 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
                      >
                        {busyId === event.id ? 'Retrying...' : 'Retry Failed'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
