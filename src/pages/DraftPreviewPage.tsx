import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import PrivacyProofPanel from '../../components/dispute/PrivacyProofPanel';
import { finalizeDisputeLetterDraft } from '../services/secureDisputePipelineService';

type DraftRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  bureau: 'experian' | 'equifax' | 'transunion';
  sanitized_facts_id: string;
  model_info: Record<string, any>;
  draft_md: string;
  draft_json: Record<string, any>;
  created_at: string;
  updated_at: string;
};

function parseParamFromUrl(param: string): string | null {
  const query = new URLSearchParams(window.location.search || '');
  const direct = query.get(param);
  if (direct) return direct;

  const hash = String(window.location.hash || '');
  const qIndex = hash.indexOf('?');
  if (qIndex >= 0) {
    const fromHash = new URLSearchParams(hash.slice(qIndex + 1)).get(param);
    if (fromHash) return fromHash;
  }

  return null;
}

export default function DraftPreviewPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [disputePacketId, setDisputePacketId] = useState('');

  const aiDraftId = useMemo(() => parseParamFromUrl('ai_draft_id'), []);

  async function ensureDisputePacket(nextDraft: DraftRow): Promise<string> {
    const existing = await supabase
      .from('dispute_packets')
      .select('id')
      .eq('user_id', nextDraft.user_id)
      .eq('bureau', nextDraft.bureau)
      .in('status', ['draft', 'finalized'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existing.error && existing.data?.id) {
      return String(existing.data.id);
    }

    const created = await supabase
      .from('dispute_packets')
      .insert({
        tenant_id: nextDraft.tenant_id,
        user_id: nextDraft.user_id,
        status: 'draft',
        bureau: nextDraft.bureau,
        letter_version: 'v1',
      })
      .select('id')
      .single();

    if (created.error || !created.data?.id) {
      throw new Error(created.error?.message || 'Unable to create dispute packet for finalize step.');
    }

    return String(created.data.id);
  }

  async function loadDraft() {
    if (!user?.id || !aiDraftId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: readError } = await supabase
        .from('ai_letter_drafts')
        .select('id,tenant_id,user_id,bureau,sanitized_facts_id,model_info,draft_md,draft_json,created_at,updated_at')
        .eq('id', aiDraftId)
        .maybeSingle();

      if (readError) throw new Error(readError.message || 'Unable to load draft.');
      if (!data) throw new Error('AI draft not found.');

      const row = data as DraftRow;
      setDraft(row);
      const packetId = await ensureDisputePacket(row);
      setDisputePacketId(packetId);
    } catch (e: any) {
      setError(String(e?.message || e));
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDraft();
  }, [user?.id, aiDraftId]);

  async function handleFinalize() {
    if (!draft || !disputePacketId) return;

    setFinalizing(true);
    setError('');
    setSuccess('');

    try {
      const result = await finalizeDisputeLetterDraft({
        ai_draft_id: draft.id,
        dispute_packet_id: disputePacketId,
      });

      setSuccess('Letter finalized and saved to dispute packet.');
      window.location.href = `/final-letter?finalized_letter_id=${encodeURIComponent(result.finalized_letter_id)}&packet_id=${encodeURIComponent(result.dispute_packet_id)}`;
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setFinalizing(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Sign in required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading AI draft preview...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 text-slate-100 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Draft Preview</h1>
        <p className="text-sm text-slate-400 mt-2">
          Review placeholder-based educational draft content before final merge and packet finalization.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">{success}</div> : null}

      {draft ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200 space-y-1">
          <p>Draft ID: <span className="font-mono text-cyan-300">{draft.id}</span></p>
          <p>Bureau: <span className="uppercase text-cyan-300">{draft.bureau}</span></p>
          <p>Dispute Packet ID: <span className="font-mono text-cyan-300">{disputePacketId || 'Creating...'}</span></p>
          <p>Educational template only. Client review required. No guaranteed outcomes.</p>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <h2 className="text-lg font-bold text-white">Template Draft (Placeholders Intact)</h2>
        <pre className="max-h-[60vh] overflow-auto rounded-xl border border-slate-700 bg-slate-950 p-4 text-xs text-slate-100 whitespace-pre-wrap">
          {draft?.draft_md || 'No draft content.'}
        </pre>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={disputePacketId}
            onChange={(e) => setDisputePacketId(e.target.value)}
            placeholder="Dispute packet UUID"
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          />
          <button
            disabled={finalizing || !draft || !disputePacketId}
            onClick={() => void handleFinalize()}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
          >
            {finalizing ? 'Finalizing...' : 'Finalize and Save'}
          </button>
        </div>
      </section>

      <PrivacyProofPanel
        sanitizedPayload={draft?.model_info?.sanitized_payload || {}}
      />
    </div>
  );
}
