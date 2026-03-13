import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

type MailPacket = {
  id: string;
  tenant_id: string;
  requester_user_id: string;
  approver_email: string;
  packet_title: string;
  document_name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

const STATUS_OPTIONS = ['draft', 'pending_client_approval', 'approved', 'rejected', 'queued', 'sent', 'canceled'];

export default function AdminMailingQueuePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [packets, setPackets] = useState<MailPacket[]>([]);

  const isSuperAdmin = user?.role === 'admin';

  async function loadPackets() {
    setLoading(true);
    setError('');

    const { data, error: readError } = await supabase
      .from('dispute_mail_packets')
      .select('id,tenant_id,requester_user_id,approver_email,packet_title,document_name,status,created_at,updated_at')
      .order('created_at', { ascending: false });

    if (readError) {
      setError(readError.message || 'Unable to load mailing queue.');
      setPackets([]);
      setLoading(false);
      return;
    }

    setPackets((data || []) as MailPacket[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    void loadPackets();
  }, [isSuperAdmin]);

  async function updateStatus(packet: MailPacket, nextStatus: string) {
    if (!user?.id) return;

    setBusyId(packet.id);
    setError('');
    setSuccess('');

    try {
      const now = new Date().toISOString();
      const patch: Record<string, any> = {
        status: nextStatus,
      };

      if (nextStatus === 'queued') patch.queued_at = now;
      if (nextStatus === 'sent') patch.sent_at = now;

      const { error: updateError } = await supabase
        .from('dispute_mail_packets')
        .update(patch)
        .eq('id', packet.id);

      if (updateError) {
        throw new Error(updateError.message || 'Unable to update status.');
      }

      await supabase.from('dispute_mail_events').insert({
        packet_id: packet.id,
        tenant_id: packet.tenant_id,
        actor_user_id: user.id,
        event_type: `mail_packet.${nextStatus}`,
        metadata: {
          previous_status: packet.status,
          next_status: nextStatus,
        },
      });

      await supabase.from('audit_events').insert({
        tenant_id: packet.tenant_id,
        actor_user_id: user.id,
        event_type: 'mail_packet.status_updated',
        metadata: {
          packet_id: packet.id,
          previous_status: packet.status,
          next_status: nextStatus,
        },
      });

      setSuccess(`Packet moved to ${nextStatus}.`);
      await loadPackets();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Super admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading mailing queue...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Admin Mailing Queue</h1>
        <p className="text-sm text-slate-400 mt-1">Client approval is required before status can move from pending to queued/sent.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Packet</th>
                <th className="px-4 py-3 text-left">Approver</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Transition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {packets.map((packet) => (
                <tr key={packet.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{packet.packet_title}</p>
                    <p className="text-xs text-slate-500">{packet.document_name}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{packet.approver_email}</td>
                  <td className="px-4 py-3 text-cyan-300 font-semibold uppercase tracking-wide">{packet.status.replaceAll('_', ' ')}</td>
                  <td className="px-4 py-3 text-slate-300">{new Date(packet.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <select
                      className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs"
                      value={packet.status}
                      disabled={busyId !== null}
                      onChange={(e) => {
                        const nextStatus = e.target.value;
                        if (nextStatus !== packet.status) {
                          void updateStatus(packet, nextStatus);
                        }
                      }}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
