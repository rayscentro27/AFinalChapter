import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { resolveTenantIdForUser } from '../../utils/tenantContext';

type MailPacket = {
  id: string;
  tenant_id: string;
  packet_title: string;
  document_name: string;
  document_body: string;
  contact_name: string | null;
  contact_email: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export default function ClientMailingApprovalsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [packets, setPackets] = useState<MailPacket[]>([]);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [hasMailAuthConsent, setHasMailAuthConsent] = useState(false);

  async function loadPackets() {
    if (!user?.email) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const [packetsRes, authRes] = await Promise.all([
      supabase
        .from('dispute_mail_packets')
        .select('id,tenant_id,packet_title,document_name,document_body,contact_name,contact_email,status,created_at,updated_at')
        .eq('approver_email', user.email)
        .order('created_at', { ascending: false }),
      user.id
        ? supabase
            .from('consents')
            .select('id')
            .eq('user_id', user.id)
            .eq('consent_type', 'docupost_mailing_auth')
            .eq('version', 'v1')
            .limit(1)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (packetsRes.error) {
      setError(packetsRes.error.message || 'Unable to load mailing approvals.');
      setPackets([]);
      setLoading(false);
      return;
    }

    setPackets((packetsRes.data || []) as MailPacket[]);
    setHasMailAuthConsent(Array.isArray(authRes.data) && authRes.data.length > 0);
    setLoading(false);
  }

  useEffect(() => {
    void loadPackets();
  }, [user?.email, user?.id]);

  async function recordEvent(packet: MailPacket, eventType: string, metadata: Record<string, unknown>) {
    if (!user?.id) return;

    await supabase.from('dispute_mail_events').insert({
      packet_id: packet.id,
      tenant_id: packet.tenant_id,
      actor_user_id: user.id,
      event_type: eventType,
      metadata,
    });

    await supabase.from('audit_events').insert({
      tenant_id: packet.tenant_id,
      actor_user_id: user.id,
      event_type,
      metadata: {
        packet_id: packet.id,
        ...metadata,
      },
    });
  }

  async function decide(packet: MailPacket, decision: 'approved' | 'rejected') {
    if (!user?.id) return;

    if (decision === 'approved' && !hasMailAuthConsent) {
      setError('Mailing authorization is required before approving a mailing packet. Open /mailing-authorization first.');
      return;
    }

    setBusyId(packet.id);
    setError('');
    setSuccess('');

    try {
      const now = new Date().toISOString();
      const notes = notesById[packet.id] || null;

      const patch: any = {
        status: decision,
        client_decision_notes: notes,
      };

      if (decision === 'approved') {
        patch.approver_user_id = user.id;
        patch.approved_at = now;
      }

      const { error: updateError } = await supabase
        .from('dispute_mail_packets')
        .update(patch)
        .eq('id', packet.id);

      if (updateError) {
        throw new Error(updateError.message || 'Unable to update packet approval status.');
      }

      await recordEvent(packet, `mail_packet.client_${decision}`, {
        decision,
        notes,
      });

      setSuccess(`Packet ${decision}.`);
      await loadPackets();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Sign in required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading mailing approvals...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Mailing Approvals</h1>
        <p className="text-sm text-slate-400 mt-1">Review and approve dispute packages before they can be sent.</p>
      </div>

      {!hasMailAuthConsent ? (
        <div className="rounded-xl border border-amber-400/40 bg-amber-950/30 p-3 text-sm text-amber-200">
          Mailing authorization not recorded yet. Complete authorization at <a href="/mailing-authorization" className="text-cyan-300 hover:text-cyan-200">/mailing-authorization</a>.
        </div>
      ) : null}

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="space-y-4">
        {packets.length === 0 ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-sm text-slate-400">No mailing packets found for your account.</div>
        ) : packets.map((packet) => (
          <div key={packet.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">{packet.packet_title}</h2>
                <p className="text-xs text-slate-400 mt-1">{packet.document_name} • {new Date(packet.created_at).toLocaleString()}</p>
              </div>
              <span className="text-xs uppercase tracking-wider font-black text-cyan-300">{packet.status.replaceAll('_', ' ')}</span>
            </div>

            <details className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
              <summary className="cursor-pointer text-sm text-slate-200">View packet content</summary>
              <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-300 max-h-72 overflow-y-auto">{packet.document_body}</pre>
            </details>

            <textarea
              placeholder="Optional notes"
              value={notesById[packet.id] || ''}
              onChange={(e) => setNotesById((prev) => ({ ...prev, [packet.id]: e.target.value }))}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
            />

            <div className="flex justify-end gap-2">
              <button
                disabled={busyId !== null || packet.status !== 'pending_client_approval'}
                onClick={() => void decide(packet, 'rejected')}
                className="rounded-xl border border-rose-500/40 px-4 py-2 text-xs font-black uppercase tracking-wider text-rose-200 disabled:opacity-50"
              >
                {busyId === packet.id ? 'Saving...' : 'Reject'}
              </button>
              <button
                disabled={busyId !== null || packet.status !== 'pending_client_approval'}
                onClick={() => void decide(packet, 'approved')}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
              >
                {busyId === packet.id ? 'Saving...' : 'Approve'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
