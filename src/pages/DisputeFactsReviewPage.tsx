import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import PrivacyProofPanel from '../../components/dispute/PrivacyProofPanel';
import { generateDisputeLetterDraft } from '../services/secureDisputePipelineService';

type DisputeFactItem = {
  creditor_furnisher: string;
  account_last4: string | null;
  date_opened: string | null;
  balance: string | null;
  reason_code: string;
  narrative: string;
};

type FactsRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  bureau: 'experian' | 'equifax' | 'transunion';
  disputes: DisputeFactItem[];
  redaction_report: Record<string, unknown>;
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

function emptyFact(): DisputeFactItem {
  return {
    creditor_furnisher: '',
    account_last4: null,
    date_opened: null,
    balance: null,
    reason_code: 'accuracy_verification',
    narrative: '',
  };
}

export default function DisputeFactsReviewPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [facts, setFacts] = useState<FactsRow | null>(null);
  const [disputes, setDisputes] = useState<DisputeFactItem[]>([]);

  const sanitizedFactsId = useMemo(() => parseParamFromUrl('sanitized_facts_id'), []);

  async function loadFacts() {
    if (!user?.id || !sanitizedFactsId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: readError } = await supabase
        .from('sanitized_dispute_facts')
        .select('id,tenant_id,user_id,bureau,disputes,redaction_report,created_at,updated_at')
        .eq('id', sanitizedFactsId)
        .maybeSingle();

      if (readError) throw new Error(readError.message || 'Unable to load sanitized facts.');
      if (!data) throw new Error('Sanitized facts not found.');

      const row = data as FactsRow;
      setFacts(row);
      setDisputes(Array.isArray(row.disputes) ? row.disputes : []);
    } catch (e: any) {
      setError(String(e?.message || e));
      setFacts(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFacts();
  }, [user?.id, sanitizedFactsId]);

  function updateDispute(index: number, key: keyof DisputeFactItem, value: string) {
    setDisputes((prev) => prev.map((item, idx) => (idx === index
      ? {
          ...item,
          [key]: value || null,
        }
      : item)));
  }

  async function saveDisputes() {
    if (!facts) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const cleaned = disputes.map((item) => ({
        creditor_furnisher: String(item.creditor_furnisher || '').trim(),
        account_last4: String(item.account_last4 || '').trim() || null,
        date_opened: String(item.date_opened || '').trim() || null,
        balance: String(item.balance || '').trim() || null,
        reason_code: String(item.reason_code || '').trim() || 'accuracy_verification',
        narrative: String(item.narrative || '').trim(),
      }));

      const { error: updateError } = await supabase
        .from('sanitized_dispute_facts')
        .update({
          disputes: cleaned,
          updated_at: new Date().toISOString(),
        })
        .eq('id', facts.id)
        .eq('user_id', facts.user_id);

      if (updateError) throw new Error(updateError.message || 'Unable to save dispute facts.');

      setSuccess('Dispute facts saved.');
      setFacts((prev) => prev ? { ...prev, disputes: cleaned } : prev);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function generateDraft() {
    if (!facts) return;

    setGenerating(true);
    setError('');

    try {
      const result = await generateDisputeLetterDraft({
        sanitized_facts_id: facts.id,
      });

      window.location.href = `/draft-preview?ai_draft_id=${encodeURIComponent(result.ai_draft_id)}`;
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setGenerating(false);
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
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading sanitized dispute facts...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 text-slate-100 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Dispute Facts Review</h1>
        <p className="text-sm text-slate-400 mt-2">
          Review sanitized educational dispute facts before AI draft generation.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">{success}</div> : null}

      {facts ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200 space-y-1">
          <p>Sanitized Facts ID: <span className="font-mono text-cyan-300">{facts.id}</span></p>
          <p>Bureau: <span className="uppercase text-cyan-300">{facts.bureau}</span></p>
          <p>Educational-only workflow. Client review required. No guaranteed outcomes.</p>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Extracted Disputes</h2>
          <button
            onClick={() => setDisputes((prev) => [...prev, emptyFact()])}
            className="rounded-xl border border-cyan-400/40 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-cyan-300"
          >
            Add Item
          </button>
        </div>

        <div className="space-y-4">
          {disputes.map((item, index) => (
            <div key={`fact-${index}`} className="rounded-xl border border-slate-700 bg-slate-950 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-slate-400">Item {index + 1}</p>
                <button
                  onClick={() => setDisputes((prev) => prev.filter((_, idx) => idx !== index))}
                  className="text-xs text-rose-300 hover:text-rose-200"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  value={item.creditor_furnisher || ''}
                  onChange={(e) => updateDispute(index, 'creditor_furnisher', e.target.value)}
                  placeholder="Creditor / Furnisher"
                  className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  value={item.account_last4 || ''}
                  onChange={(e) => updateDispute(index, 'account_last4', e.target.value)}
                  placeholder="Account Last 4"
                  className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  value={item.date_opened || ''}
                  onChange={(e) => updateDispute(index, 'date_opened', e.target.value)}
                  placeholder="Date Opened"
                  className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  value={item.balance || ''}
                  onChange={(e) => updateDispute(index, 'balance', e.target.value)}
                  placeholder="Balance"
                  className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  value={item.reason_code || ''}
                  onChange={(e) => updateDispute(index, 'reason_code', e.target.value)}
                  placeholder="Reason Code"
                  className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 md:col-span-2"
                />
                <textarea
                  value={item.narrative || ''}
                  onChange={(e) => updateDispute(index, 'narrative', e.target.value)}
                  placeholder="Narrative"
                  className="w-full min-h-[100px] rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 md:col-span-2"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            disabled={saving}
            onClick={() => void saveDisputes()}
            className="rounded-xl border border-slate-500/50 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-200 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Facts'}
          </button>
          <button
            disabled={generating || !facts}
            onClick={() => void generateDraft()}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
          >
            {generating ? 'Generating Draft...' : 'Generate Draft'}
          </button>
        </div>
      </section>

      <PrivacyProofPanel
        sanitizedPayload={{ bureau: facts?.bureau, disputes }}
        redactionReport={facts?.redaction_report}
      />
    </div>
  );
}
