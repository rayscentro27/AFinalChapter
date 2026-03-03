import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  ConsentRequirementRow,
  DEFAULT_REQUIRED_CONSENT_FLAGS,
  DEFAULT_REQUIRED_CONSENT_VERSIONS,
  REQUIRED_CONSENT_TYPES,
  RequiredConsentType,
  consentTypeToLegalDocKey,
} from '../components/legal/legalDocuments';

export type ConsentSelections = Record<RequiredConsentType, boolean>;
export type ConsentVersionMap = Record<RequiredConsentType, string>;

export type ConsentPolicySnapshot = {
  policyKey: string | null;
  policyTitle: string | null;
  policyVersionId: string | null;
  policyHash: string | null;
  version: string | null;
};

export type ConsentPolicySnapshotMap = Record<RequiredConsentType, ConsentPolicySnapshot>;

const DEFAULT_POLICY_SNAPSHOT_MAP: ConsentPolicySnapshotMap = {
  terms: {
    policyKey: 'terms',
    policyTitle: null,
    policyVersionId: null,
    policyHash: null,
    version: null,
  },
  privacy: {
    policyKey: 'privacy',
    policyTitle: null,
    policyVersionId: null,
    policyHash: null,
    version: null,
  },
  ai_disclosure: {
    policyKey: 'ai_disclosure',
    policyTitle: null,
    policyVersionId: null,
    policyHash: null,
    version: null,
  },
  disclaimers: {
    policyKey: 'disclaimers',
    policyTitle: null,
    policyVersionId: null,
    policyHash: null,
    version: null,
  },
  comms_email: {
    policyKey: null,
    policyTitle: null,
    policyVersionId: null,
    policyHash: null,
    version: null,
  },
};

export type ConsentStatusRow = {
  user_id: string;
  tenant_id: string | null;
  terms_accepted: boolean;
  privacy_accepted: boolean;
  ai_disclosure_accepted: boolean;
  disclaimers_accepted: boolean;
  comms_email_accepted: boolean;
  has_required_consents: boolean;
};

type UseConsentGateResult = {
  loading: boolean;
  submitting: boolean;
  needsAcceptance: boolean;
  status: ConsentStatusRow | null;
  error: string | null;
  requiredTypes: RequiredConsentType[];
  requiredVersions: ConsentVersionMap;
  requiredPolicySnapshots: ConsentPolicySnapshotMap;
  acceptConsents: (selected: ConsentSelections) => Promise<void>;
  refresh: () => Promise<void>;
};

type PolicyDocumentRow = {
  id: string;
  key: string;
  title: string;
};

type PolicyVersionRow = {
  id: string;
  document_id: string;
  version: string;
  content_hash: string;
  is_published: boolean;
  published_at: string | null;
};

function emptySelections(): ConsentSelections {
  return {
    terms: false,
    privacy: false,
    ai_disclosure: false,
    disclaimers: false,
    comms_email: false,
  };
}

async function sha256Hex(input: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  const encoder = new TextEncoder();
  const digest = await window.crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
}

async function sendConsentWelcomeEmail(userId: string, tenantId: string | null): Promise<void> {
  const authRes = await supabase.auth.getUser();
  const toEmail = String(authRes.data.user?.email || '').trim();
  if (!toEmail) return;

  await supabase.functions.invoke('email-orchestrator', {
    body: {
      message_type: 'onboarding',
      to: toEmail,
      subject: 'Welcome to Nexus',
      html: '<p><strong>Welcome to Nexus.</strong></p><p>Your account consents are complete and your workspace is ready to use.</p>',
      text: 'Welcome to Nexus. Your account consents are complete and your workspace is ready to use.',
      template_key: 'consent_gate_welcome',
      user_id: userId,
      tenant_id: tenantId,
      data: {
        source: 'consent_gate',
      },
    },
  });
}

function isSchemaNotReadyError(code?: string): boolean {
  return code === '42P01' || code === 'PGRST116';
}

async function resolveTenantId(userId: string): Promise<string | null> {
  const primary = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!primary.error) {
    return String(primary.data?.tenant_id || '').trim() || null;
  }

  if (!isSchemaNotReadyError(primary.error.code)) {
    throw new Error(primary.error.message || 'Unable to resolve tenant for consent logging.');
  }

  const fallback = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (fallback.error && !isSchemaNotReadyError(fallback.error.code)) {
    throw new Error(fallback.error.message || 'Unable to resolve tenant for consent logging.');
  }

  return String(fallback.data?.tenant_id || '').trim() || null;
}

export function statusToSelections(status: ConsentStatusRow | null): ConsentSelections {
  if (!status) return emptySelections();
  return {
    terms: !!status.terms_accepted,
    privacy: !!status.privacy_accepted,
    ai_disclosure: !!status.ai_disclosure_accepted,
    disclaimers: !!status.disclaimers_accepted,
    comms_email: !!status.comms_email_accepted,
  };
}

export default function useConsentGate(userId: string | null): UseConsentGateResult {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<ConsentStatusRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requiredTypes, setRequiredTypes] = useState<RequiredConsentType[]>(REQUIRED_CONSENT_TYPES);
  const [requiredVersions, setRequiredVersions] = useState<ConsentVersionMap>(DEFAULT_REQUIRED_CONSENT_VERSIONS);
  const [requiredPolicySnapshots, setRequiredPolicySnapshots] = useState<ConsentPolicySnapshotMap>(DEFAULT_POLICY_SNAPSHOT_MAP);

  const refresh = useCallback(async () => {
    if (!userId) {
      setStatus(null);
      setLoading(false);
      setError(null);
      setRequiredTypes(REQUIRED_CONSENT_TYPES);
      setRequiredVersions(DEFAULT_REQUIRED_CONSENT_VERSIONS);
      setRequiredPolicySnapshots(DEFAULT_POLICY_SNAPSHOT_MAP);
      return;
    }

    setLoading(true);
    setError(null);

    const [statusRes, requirementsRes] = await Promise.all([
      supabase
        .from('user_consent_status')
        .select('user_id,tenant_id,terms_accepted,privacy_accepted,ai_disclosure_accepted,disclaimers_accepted,comms_email_accepted,has_required_consents')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('consent_requirements')
        .select('consent_type,current_version,is_required')
        .in('consent_type', REQUIRED_CONSENT_TYPES),
    ]);

    const { data, error: readError } = statusRes;
    const { data: requirementsData, error: requirementsError } = requirementsRes;

    const nextVersions: ConsentVersionMap = { ...DEFAULT_REQUIRED_CONSENT_VERSIONS };
    const nextFlags: Record<RequiredConsentType, boolean> = { ...DEFAULT_REQUIRED_CONSENT_FLAGS };

    if (requirementsError) {
      if (!isSchemaNotReadyError(requirementsError.code)) {
        setError(requirementsError.message || 'Unable to load consent requirement versions.');
      }
    } else {
      for (const row of (requirementsData || []) as ConsentRequirementRow[]) {
        const consentType = row.consent_type;
        if (!REQUIRED_CONSENT_TYPES.includes(consentType)) continue;
        nextVersions[consentType] = row.current_version || nextVersions[consentType];
        nextFlags[consentType] = row.is_required;
      }
    }

    const nextRequiredTypes = REQUIRED_CONSENT_TYPES.filter((type) => nextFlags[type]);
    setRequiredTypes(nextRequiredTypes.length > 0 ? nextRequiredTypes : REQUIRED_CONSENT_TYPES);

    const linkedPolicyKeys = REQUIRED_CONSENT_TYPES
      .map((consentType) => ({ consentType, policyKey: consentTypeToLegalDocKey(consentType) }))
      .filter((item): item is { consentType: RequiredConsentType; policyKey: string } => Boolean(item.policyKey));

    const nextPolicySnapshots: ConsentPolicySnapshotMap = { ...DEFAULT_POLICY_SNAPSHOT_MAP };

    if (linkedPolicyKeys.length > 0) {
      const keyList = linkedPolicyKeys.map((item) => item.policyKey);
      const docsRes = await supabase
        .from('policy_documents')
        .select('id,key,title')
        .in('key', keyList)
        .eq('is_active', true);

      if (docsRes.error) {
        if (!isSchemaNotReadyError(docsRes.error.code)) {
          setError((prev) => prev || docsRes.error.message || 'Unable to load policy documents.');
        }
      } else {
        const docs = (docsRes.data || []) as PolicyDocumentRow[];
        const docsByKey = new Map<string, PolicyDocumentRow>();
        for (const doc of docs) {
          docsByKey.set(doc.key, doc);
        }

        if (docs.length > 0) {
          const docIds = docs.map((doc) => doc.id);
          const versionsRes = await supabase
            .from('policy_versions')
            .select('id,document_id,version,content_hash,is_published,published_at')
            .in('document_id', docIds)
            .eq('is_published', true)
            .order('published_at', { ascending: false });

          if (versionsRes.error) {
            if (!isSchemaNotReadyError(versionsRes.error.code)) {
              setError((prev) => prev || versionsRes.error.message || 'Unable to load policy versions.');
            }
          } else {
            const versions = (versionsRes.data || []) as PolicyVersionRow[];
            const latestByDocument = new Map<string, PolicyVersionRow>();
            for (const version of versions) {
              if (!latestByDocument.has(version.document_id)) {
                latestByDocument.set(version.document_id, version);
              }
            }

            for (const item of linkedPolicyKeys) {
              const doc = docsByKey.get(item.policyKey);
              if (!doc) continue;
              const latest = latestByDocument.get(doc.id);
              if (!latest) continue;

              nextPolicySnapshots[item.consentType] = {
                policyKey: doc.key,
                policyTitle: doc.title,
                policyVersionId: latest.id,
                policyHash: latest.content_hash || null,
                version: latest.version,
              };

              nextVersions[item.consentType] = latest.version || nextVersions[item.consentType];
            }
          }
        }
      }
    }

    setRequiredVersions(nextVersions);
    setRequiredPolicySnapshots(nextPolicySnapshots);

    if (readError) {
      if (isSchemaNotReadyError(readError.code)) {
        setStatus(null);
      } else {
        setError((prev) => prev || readError.message || 'Unable to load consent status.');
        setStatus(null);
      }
      setLoading(false);
      return;
    }

    setStatus((data || null) as ConsentStatusRow | null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const acceptConsents = useCallback(async (selected: ConsentSelections) => {
    if (!userId) return;

    const hadRequiredConsents = Boolean(status?.has_required_consents);

    setSubmitting(true);
    setError(null);
    try {
      const missingRequired = requiredTypes.some((type) => !selected[type]);
      if (missingRequired) {
        throw new Error('All required consents must be accepted to continue.');
      }

      const tenantId = await resolveTenantId(userId);
      const now = new Date().toISOString();
      const userAgent = navigator.userAgent || 'unknown';
      const ipHash = await sha256Hex(`ip_unavailable:${userId}:${now}`);

      const acceptedTypes = requiredTypes.filter((type) => selected[type]);
      if (acceptedTypes.length === 0) {
        throw new Error('No required consents were selected.');
      }

      const consentRows = acceptedTypes.map((consentType) => {
        const policySnapshot = requiredPolicySnapshots[consentType];
        const version = requiredVersions[consentType] || policySnapshot?.version || 'v1';
        return {
          user_id: userId,
          tenant_id: tenantId,
          consent_type: consentType,
          version,
          policy_version_id: policySnapshot?.policyVersionId || null,
          accepted_at: now,
          ip_hash: ipHash,
          user_agent: userAgent,
          metadata: {
            policy_key: policySnapshot?.policyKey || null,
            policy_title: policySnapshot?.policyTitle || null,
            policy_version_id: policySnapshot?.policyVersionId || null,
            policy_version: version,
            policy_hash: policySnapshot?.policyHash || null,
          },
        };
      });

      const { error: insertError } = await supabase.from('consents').upsert(consentRows, {
        onConflict: 'user_id,consent_type,version',
      });

      if (insertError) {
        throw new Error(insertError.message || 'Unable to save consent records.');
      }

      const auditRows = acceptedTypes.map((consentType) => {
        const policySnapshot = requiredPolicySnapshots[consentType];
        const version = requiredVersions[consentType] || policySnapshot?.version || 'v1';
        return {
          tenant_id: tenantId,
          actor_user_id: userId,
          event_type: 'consent.accepted',
          action: 'consent.accepted',
          entity_type: 'consent',
          entity_id: `${userId}:${consentType}:${version}`,
          occurred_at: now,
          created_at: now,
          metadata: {
            consent_type: consentType,
            version,
            policy_version_id: policySnapshot?.policyVersionId || null,
            policy_hash: policySnapshot?.policyHash || null,
            accepted_at: now,
            ip_hash: ipHash,
            user_agent: userAgent,
          },
        };
      });

      const { error: auditError } = await supabase.from('audit_events').insert(auditRows);
      if (auditError) {
        throw new Error(auditError.message || 'Unable to write consent audit logs.');
      }

      await refresh();

      if (!hadRequiredConsents) {
        try {
          await sendConsentWelcomeEmail(userId, tenantId);
        } catch (welcomeError) {
          console.warn('Consent welcome email enqueue failed', welcomeError);
        }
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      throw e;
    } finally {
      setSubmitting(false);
    }
  }, [refresh, requiredPolicySnapshots, requiredTypes, requiredVersions, status, userId]);

  const needsAcceptance = !loading && !status?.has_required_consents;

  return {
    loading,
    submitting,
    needsAcceptance,
    status,
    error,
    requiredTypes,
    requiredVersions,
    requiredPolicySnapshots,
    acceptConsents,
    refresh,
  };
}
