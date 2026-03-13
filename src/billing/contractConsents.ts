import { supabase } from '../../lib/supabaseClient';

export const MEMBERSHIP_AGREEMENT_VERSION = 'v1';
export const REFUND_POLICY_VERSION = 'v1';
export const COMMISSION_DISCLOSURE_VERSION = 'v1';

async function sha256Hex(input: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('');
}

export async function recordPaidUpgradeContractConsents(input: {
  userId: string;
  tenantId: string | null;
}) {
  const acceptedAt = new Date().toISOString();
  const userAgent = navigator.userAgent || 'unknown';
  const ipHash = await sha256Hex(`upgrade:${input.userId}:${acceptedAt}`);

  const rows = [
    {
      user_id: input.userId,
      tenant_id: input.tenantId,
      consent_type: 'membership_agreement',
      version: MEMBERSHIP_AGREEMENT_VERSION,
      accepted_at: acceptedAt,
      ip_hash: ipHash,
      user_agent: userAgent,
    },
    {
      user_id: input.userId,
      tenant_id: input.tenantId,
      consent_type: 'refund_policy',
      version: REFUND_POLICY_VERSION,
      accepted_at: acceptedAt,
      ip_hash: ipHash,
      user_agent: userAgent,
    },
  ];

  const { error } = await supabase.from('consents').upsert(rows, {
    onConflict: 'user_id,consent_type,version',
  });

  if (error) {
    throw new Error(error.message || 'Unable to record paid plan contract consents.');
  }

  return {
    acceptedAt,
    membershipAgreementVersion: MEMBERSHIP_AGREEMENT_VERSION,
    refundPolicyVersion: REFUND_POLICY_VERSION,
    ipHash,
    userAgent,
  };
}
