import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import DocuPostAuthorizationModal, { DOCUPOST_AUTH_ACKNOWLEDGEMENT } from '../../components/mailing/DocuPostAuthorizationModal';
import { authorizeAndSendDocuPost, DocuPostAddress } from '../services/docupostMailService';
import { resolveTenantIdForUser, sha256Marker } from '../../utils/tenantContext';

type DisputePacket = {
  id: string;
  tenant_id: string;
  user_id: string;
  status: 'draft' | 'finalized' | 'mailed' | 'mail_failed';
  bureau: 'experian' | 'equifax' | 'transunion';
  letter_version: string;
  final_doc_storage_path: string | null;
  final_doc_hash: string | null;
  created_at: string;
  updated_at: string;
};

function parsePacketIdFromUrl(): string | null {
  const query = new URLSearchParams(window.location.search || '');
  const fromQuery = query.get('packet_id') || query.get('packet');
  if (fromQuery) return fromQuery;

  const hash = String(window.location.hash || '');
  const index = hash.indexOf('?');
  if (index >= 0) {
    const hashQuery = new URLSearchParams(hash.slice(index + 1));
    const fromHash = hashQuery.get('packet_id') || hashQuery.get('packet');
    if (fromHash) return fromHash;
  }

  return null;
}

function parseStoragePath(input: string): { bucket: string; objectPath: string } | null {
  const raw = String(input || '').trim().replace(/^\/+/, '');
  if (!raw) return null;

  const slash = raw.indexOf('/');
  if (slash <= 0) return null;

  const bucket = raw.slice(0, slash).trim();
  const objectPath = raw.slice(slash + 1).trim();
  if (!bucket || !objectPath) return null;

  return { bucket, objectPath };
}

export default function DisputeLetterPreviewPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [packet, setPacket] = useState<DisputePacket | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);

  const packetId = useMemo(() => parsePacketIdFromUrl(), []);

  async function loadPacket() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    if (!packetId) {
      setError('Missing dispute packet id. Open /dispute-letter-preview?packet_id=<uuid>.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: packetError } = await supabase
        .from('dispute_packets')
        .select('id,tenant_id,user_id,status,bureau,letter_version,final_doc_storage_path,final_doc_hash,created_at,updated_at')
        .eq('id', packetId)
        .maybeSingle();

      if (packetError) {
        throw new Error(packetError.message || 'Unable to load dispute packet.');
      }

      if (!data) {
        throw new Error('Dispute packet not found.');
      }

      const nextPacket = data as DisputePacket;
      setPacket(nextPacket);

      if (nextPacket.final_doc_storage_path) {
        const parsed = parseStoragePath(nextPacket.final_doc_storage_path);
        if (!parsed) {
          throw new Error('Invalid storage path format on dispute packet.');
        }

        const { data: signed, error: signedError } = await supabase
          .storage
          .from(parsed.bucket)
          .createSignedUrl(parsed.objectPath, 60 * 10);

        if (signedError) {
          throw new Error(signedError.message || 'Unable to create signed URL for letter preview.');
        }

        setSignedUrl(signed?.signedUrl || null);
      } else {
        setSignedUrl(null);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      setPacket(null);
      setSignedUrl(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPacket();
  }, [user?.id, packetId]);

  async function authorizeAndSend(address: DocuPostAddress, acknowledgement: string) {
    if (!user?.id || !packet) return;

    setSending(true);
    setError('');
    setSuccess('');

    try {
      const tenantId = packet.tenant_id || (await resolveTenantIdForUser(user.id));
      const now = new Date().toISOString();
      const ipHash = await sha256Marker(`${user.id}:${packet.id}:${now}:docupost_send`);
      const userAgent = navigator.userAgent || 'unknown';

      const { data: consentVersionRow } = await supabase
        .from('consent_requirements')
        .select('current_version')
        .eq('consent_type', 'docupost_mailing_auth')
        .limit(1)
        .maybeSingle();

      const consentVersion = String(consentVersionRow?.current_version || 'v1');

      const { error: consentError } = await supabase
        .from('consents')
        .upsert({
          user_id: user.id,
          tenant_id: tenantId,
          consent_type: 'docupost_mailing_auth',
          version: consentVersion,
          accepted_at: now,
          ip_hash: ipHash,
          user_agent: userAgent,
          metadata: {
            dispute_packet_id: packet.id,
            acknowledgement,
          },
        }, {
          onConflict: 'user_id,consent_type,version',
        });

      if (consentError) {
        throw new Error(consentError.message || 'Unable to record mailing authorization consent.');
      }

      const result = await authorizeAndSendDocuPost({
        dispute_packet_id: packet.id,
        ...address,
      });

      setSuccess(`Mailing event queued. Status: ${result.status}${result.provider_reference_id ? ` (${result.provider_reference_id})` : ''}`);
      setOpenModal(false);
      await loadPacket();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSending(false);
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
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading dispute letter preview...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-3xl font-black text-white">Dispute Letter Preview</h1>
        <p className="text-sm text-slate-400 mt-1">
          Review your finalized letter before optional third-party print-and-mail submission via DocuPost.
        </p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      {packet ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200 space-y-1">
          <div>Packet: <span className="text-cyan-300 font-semibold">{packet.id}</span></div>
          <div>Bureau: <span className="uppercase text-cyan-300 font-semibold">{packet.bureau}</span></div>
          <div>Status: <span className="uppercase text-cyan-300 font-semibold">{packet.status}</span></div>
          <div>Letter version: <span className="text-cyan-300 font-semibold">{packet.letter_version}</span></div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden min-h-[60vh]">
        {signedUrl ? (
          <iframe
            src={signedUrl}
            title="Dispute Letter Preview"
            className="w-full min-h-[60vh] bg-slate-950"
          />
        ) : (
          <div className="min-h-[60vh] flex items-center justify-center text-slate-500 text-sm">
            Finalized preview file is not available yet.
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          disabled={!packet || !signedUrl || sending}
          onClick={() => setOpenModal(true)}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
        >
          Mail via DocuPost
        </button>
      </div>

      <DocuPostAuthorizationModal
        open={openModal}
        loading={sending}
        error={error || null}
        defaultAddress={{ to_name: user.name || '', to_zip: '' }}
        onClose={() => setOpenModal(false)}
        onAuthorize={authorizeAndSend}
      />

      <p className="text-xs text-slate-500">
        Authorization acknowledgment: "{DOCUPOST_AUTH_ACKNOWLEDGEMENT}"
      </p>
    </div>
  );
}
