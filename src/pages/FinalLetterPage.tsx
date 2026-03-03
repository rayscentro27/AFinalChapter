import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

type FinalizedLetterRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  bureau: 'experian' | 'equifax' | 'transunion';
  ai_draft_id: string;
  dispute_packet_id: string;
  final_html: string;
  final_pdf_path: string;
  final_doc_hash: string;
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

function parseStoragePath(input: string): { bucket: string; objectPath: string } | null {
  const raw = String(input || '').trim().replace(/^\/+/, '');
  if (!raw) return null;

  const idx = raw.indexOf('/');
  if (idx <= 0) return null;

  const bucket = raw.slice(0, idx).trim();
  const objectPath = raw.slice(idx + 1).trim();
  if (!bucket || !objectPath) return null;

  return { bucket, objectPath };
}

export default function FinalLetterPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [letter, setLetter] = useState<FinalizedLetterRow | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const finalizedLetterId = useMemo(() => parseParamFromUrl('finalized_letter_id'), []);
  const packetId = useMemo(() => parseParamFromUrl('packet_id'), []);

  async function loadLetter() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      let query = supabase
        .from('finalized_letters')
        .select('id,tenant_id,user_id,bureau,ai_draft_id,dispute_packet_id,final_html,final_pdf_path,final_doc_hash,created_at,updated_at')
        .eq('user_id', user.id);

      if (finalizedLetterId) {
        query = query.eq('id', finalizedLetterId);
      } else if (packetId) {
        query = query.eq('dispute_packet_id', packetId);
      } else {
        throw new Error('Missing finalized letter context. Open /final-letter?finalized_letter_id=<uuid>.');
      }

      const result = finalizedLetterId
        ? await query.maybeSingle()
        : await query.order('created_at', { ascending: false }).limit(1).maybeSingle();

      if (result.error) throw new Error(result.error.message || 'Unable to load finalized letter.');
      if (!result.data) throw new Error('Finalized letter not found.');

      const row = result.data as FinalizedLetterRow;
      setLetter(row);

      const parsedPath = parseStoragePath(row.final_pdf_path);
      if (parsedPath) {
        const signed = await supabase.storage
          .from(parsedPath.bucket)
          .createSignedUrl(parsedPath.objectPath, 60 * 10);

        if (signed.error) throw new Error(signed.error.message || 'Unable to create signed URL for final letter preview.');
        setSignedUrl(signed.data?.signedUrl || null);
      } else {
        setSignedUrl(null);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      setLetter(null);
      setSignedUrl(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLetter();
  }, [user?.id, finalizedLetterId, packetId]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Sign in required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading finalized letter...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 text-slate-100 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Final Letter</h1>
        <p className="text-sm text-slate-400 mt-2">
          Finalized educational template output. Client review remains required before optional mailing actions.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div> : null}

      {letter ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200 space-y-1">
          <p>Finalized Letter ID: <span className="font-mono text-cyan-300">{letter.id}</span></p>
          <p>Dispute Packet ID: <span className="font-mono text-cyan-300">{letter.dispute_packet_id}</span></p>
          <p>Artifact Path: <span className="font-mono text-cyan-300">{letter.final_pdf_path}</span></p>
          <p>Hash: <span className="font-mono text-cyan-300">{letter.final_doc_hash}</span></p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden min-h-[60vh]">
        {signedUrl ? (
          <iframe
            src={signedUrl}
            title="Final Letter Preview"
            className="w-full min-h-[60vh] bg-slate-950"
          />
        ) : (
          <div className="min-h-[60vh] flex items-center justify-center text-slate-500 text-sm">
            Final artifact preview is unavailable.
          </div>
        )}
      </div>

      {letter ? (
        <div className="flex flex-wrap gap-3">
          <a
            href={`/dispute-letter-preview?packet_id=${encodeURIComponent(letter.dispute_packet_id)}`}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950"
          >
            Open Dispute Packet Preview
          </a>
          <a
            href={`/draft-preview?ai_draft_id=${encodeURIComponent(letter.ai_draft_id)}`}
            className="rounded-xl border border-slate-500/50 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-200"
          >
            Back to Draft
          </a>
        </div>
      ) : null}
    </div>
  );
}
