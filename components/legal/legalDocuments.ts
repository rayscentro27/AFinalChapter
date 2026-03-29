export type RequiredConsentType =
  | 'terms'
  | 'privacy'
  | 'ai_disclosure'
  | 'disclaimers'
  | 'comms_email';

export const REQUIRED_CONSENT_TYPES: RequiredConsentType[] = [
  'terms',
  'privacy',
  'ai_disclosure',
  'disclaimers',
  'comms_email',
];

export const DEFAULT_REQUIRED_CONSENT_VERSIONS: Record<RequiredConsentType, string> = {
  terms: 'v1',
  privacy: 'v1',
  ai_disclosure: 'v1',
  disclaimers: 'v1',
  comms_email: 'v1',
};

export const DEFAULT_REQUIRED_CONSENT_FLAGS: Record<RequiredConsentType, boolean> = {
  terms: true,
  privacy: true,
  ai_disclosure: true,
  disclaimers: true,
  comms_email: true,
};

export type LegalDocumentKey =
  | 'terms'
  | 'privacy'
  | 'ai_disclosure'
  | 'disclaimers'
  | 'refund_policy'
  | 'commission_disclosure'
  | 'docupost_mailing_auth'
  | 'membership_agreement';

export const LEGAL_DOCUMENT_KEYS: LegalDocumentKey[] = [
  'terms',
  'privacy',
  'ai_disclosure',
  'disclaimers',
  'refund_policy',
  'commission_disclosure',
  'docupost_mailing_auth',
  'membership_agreement',
];

export const LEGAL_DOCUMENT_LABELS: Record<LegalDocumentKey, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  ai_disclosure: 'AI Disclosure',
  disclaimers: 'Required Disclaimers',
  refund_policy: 'Refund Policy',
  commission_disclosure: 'Commission Disclosure',
  docupost_mailing_auth: 'DocuPost Mailing Authorization',
  membership_agreement: 'Membership Agreement',
};

export type LegalDocumentRow = {
  id: string;
  policy_version_id: string;
  doc_key: LegalDocumentKey;
  version: string;
  title: string;
  subtitle: string | null;
  markdown_body: string;
  content_hash: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConsentRequirementRow = {
  consent_type: RequiredConsentType;
  current_version: string;
  is_required: boolean;
};

export function legalDocKeyToConsentType(docKey: LegalDocumentKey): RequiredConsentType | null {
  if (docKey === 'terms') return 'terms';
  if (docKey === 'privacy') return 'privacy';
  if (docKey === 'ai_disclosure') return 'ai_disclosure';
  if (docKey === 'disclaimers') return 'disclaimers';
  return null;
}

export function consentTypeToLegalDocKey(consentType: RequiredConsentType): LegalDocumentKey | null {
  if (consentType === 'terms') return 'terms';
  if (consentType === 'privacy') return 'privacy';
  if (consentType === 'ai_disclosure') return 'ai_disclosure';
  if (consentType === 'disclaimers') return 'disclaimers';
  return null;
}

export function extractMarkdownListItems(markdown: string): string[] {
  return String(markdown || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- ') || line.startsWith('* '))
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
}

export function suggestNextVersionTag(versions: string[]): string {
  let maxVersionNumber = 0;
  for (const version of versions) {
    const match = String(version || '').trim().match(/^v(\d+)$/i);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxVersionNumber) {
      maxVersionNumber = value;
    }
  }
  return `v${maxVersionNumber + 1}`;
}
