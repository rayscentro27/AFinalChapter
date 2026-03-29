import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import LegalPageLayout from '../../components/legal/LegalPageLayout';
import LegalMarkdownContent from '../../components/legal/LegalMarkdownContent';
import useLegalDocument from '../../hooks/useLegalDocument';
import { resolveTenantIdForUser, sha256Marker } from '../../utils/tenantContext';

export default function MailingAuthorizationPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const legalDoc = useLegalDocument('docupost_mailing_auth');
  const activeVersion = useMemo(() => legalDoc.document?.version || 'v1', [legalDoc.document?.version]);
  const activePolicyVersionId = useMemo(() => legalDoc.document?.policy_version_id || null, [legalDoc.document?.policy_version_id]);

  async function loadState() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let query = supabase
      .from('consents')
      .select('accepted_at')
      .eq('user_id', user.id)
      .eq('consent_type', 'docupost_mailing_auth')
      .order('accepted_at', { ascending: false })
      .limit(1);

    if (activePolicyVersionId) {
      query = query.eq('policy_version_id', activePolicyVersionId);
    } else {
      query = query.eq('version', activeVersion);
    }

    const { data, error: readError } = await query.maybeSingle();

    if (readError) {
      setError(readError.message || 'Unable to load authorization status.');
      setLoading(false);
      return;
    }

    setAcceptedAt(data?.accepted_at || null);
    setLoading(false);
  }

  useEffect(() => {
    void loadState();
  }, [user?.id, activeVersion, activePolicyVersionId]);

  async function acceptAuthorization() {
    if (!user?.id) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const tenantId = await resolveTenantIdForUser(user.id);
      const now = new Date().toISOString();
      const userAgent = navigator.userAgent || 'unknown';
      const ipHash = await sha256Marker(`${user.id}:${now}:docupost_auth`);

      const { error: consentError } = await supabase.from('consents').upsert({
        user_id: user.id,
        tenant_id: tenantId,
        consent_type: 'docupost_mailing_auth',
        version: activeVersion,
        policy_version_id: activePolicyVersionId,
        accepted_at: now,
        ip_hash: ipHash,
        user_agent: userAgent,
        metadata: {
          policy_version: activeVersion,
          policy_version_id: activePolicyVersionId,
          policy_hash: legalDoc.document?.content_hash || null,
        },
      }, {
        onConflict: 'user_id,consent_type,version',
      });

      if (consentError) {
        throw new Error(consentError.message || 'Unable to save mailing authorization consent.');
      }

      if (tenantId) {
        await supabase.from('audit_events').insert({
          tenant_id: tenantId,
          actor_user_id: user.id,
          event_type: 'docupost_mailing_auth.accepted',
          metadata: {
            version: activeVersion,
            policy_version_id: activePolicyVersionId,
            accepted_at: now,
          },
        });
      }

      setAcceptedAt(now);
      setSuccess('Mailing authorization recorded.');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <LegalPageLayout
      title={legalDoc.document?.title || 'Mailing Authorization'}
      subtitle={legalDoc.document?.subtitle || 'Client authorization required before any dispute package is queued for physical mailing.'}
    >
      {legalDoc.loading && !legalDoc.document ? (
        <div className="text-sm text-slate-400">Loading legal policy...</div>
      ) : legalDoc.document?.markdown_body ? (
        <>
          <LegalMarkdownContent markdown={legalDoc.document.markdown_body} />
          <div className="rounded-lg border border-cyan-300/20 bg-cyan-900/20 px-3 py-2 text-[11px] text-cyan-100 inline-block">
            Version: {activeVersion}
          </div>
        </>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-xl font-black text-white tracking-tight">Authorization Scope</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              You authorize Nexus to prepare and queue your approved dispute package for mailing through supported mailing workflows.
              No package is mailed until you explicitly approve the specific package details.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-black text-white tracking-tight">No Guarantees</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Mailing a dispute package does not guarantee removal, correction, lender action, or timeline outcomes.
            </p>
          </section>
        </>
      )}

      {loading ? (
        <div className="text-sm text-slate-400">Loading authorization status...</div>
      ) : (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4 space-y-3">
          <div className="text-sm text-slate-200">
            Status:{' '}
            {acceptedAt
              ? <span className="text-emerald-300 font-semibold">Authorized ({new Date(acceptedAt).toLocaleString()})</span>
              : <span className="text-amber-300 font-semibold">Not yet authorized</span>}
          </div>

          {error ? <div className="text-sm text-rose-300">{error}</div> : null}
          {success ? <div className="text-sm text-emerald-300">{success}</div> : null}

          {user ? (
            <button
              onClick={() => void acceptAuthorization()}
              disabled={saving}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
            >
              {saving ? 'Saving...' : acceptedAt ? 'Re-Accept Authorization' : 'Accept Mailing Authorization'}
            </button>
          ) : (
            <p className="text-sm text-slate-500">Sign in to record authorization.</p>
          )}
        </div>
      )}
    </LegalPageLayout>
  );
}
