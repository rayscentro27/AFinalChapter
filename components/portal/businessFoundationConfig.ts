import { BusinessFoundationProfileResponse } from '../../services/fundingFoundationService';

export type BusinessFoundationPath = 'new_business' | 'existing_business_optimization';

export type BusinessFoundationItem = {
  key: string;
  label: string;
  description: string;
  helper: string;
  required: boolean;
  complete: boolean;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  fieldGroup:
    | 'path'
    | 'formation'
    | 'identity'
    | 'contact'
    | 'naics'
    | 'banking'
    | 'consistency'
    | 'credibility';
};

export const PATH_LABELS: Record<BusinessFoundationPath, string> = {
  new_business: 'Build A New Business',
  existing_business_optimization: 'Use My Existing Business',
};

export const NAICS_SUGGESTIONS = [
  {
    code: '541611',
    label: 'Consulting',
    fit: 'Strong funding fit',
    reason: 'Flexible, low-overhead, and broadly fundable for service businesses.',
  },
  {
    code: '611430',
    label: 'Education And Training',
    fit: 'Strong funding fit',
    reason: 'Clear service model with scalable offers and credible educational positioning.',
  },
  {
    code: '518210',
    label: 'Digital Services',
    fit: 'Strong funding fit',
    reason: 'Modern service-oriented category that aligns with online operators and agencies.',
  },
];

export const HIGH_RISK_NAICS = new Set([
  '713210',
  '522298',
  '812990',
]);

type StatusLike = 'not_started' | 'in_progress' | 'completed' | 'blocked';

const NEW_BUSINESS_ITEMS: Array<Omit<BusinessFoundationItem, 'complete' | 'status'>> = [
  {
    key: 'llc_setup',
    label: 'LLC Creation',
    description: 'Set legal structure, entity name, and formation posture.',
    helper: 'A clean entity foundation is the start of a fundable profile.',
    required: true,
    fieldGroup: 'formation',
  },
  {
    key: 'ein_setup',
    label: 'EIN',
    description: 'Confirm the EIN tied to the business profile.',
    helper: 'The EIN must align with the entity and readiness records.',
    required: true,
    fieldGroup: 'identity',
  },
  {
    key: 'business_address',
    label: 'Business Address',
    description: 'Use a business-ready address for consistency and verification.',
    helper: 'Address consistency supports compliance and lender confidence.',
    required: true,
    fieldGroup: 'identity',
  },
  {
    key: 'business_phone',
    label: 'Business Phone',
    description: 'Set the phone number used across the business footprint.',
    helper: 'Your phone should match your site and operational records.',
    required: true,
    fieldGroup: 'contact',
  },
  {
    key: 'business_website',
    label: 'Website',
    description: 'Add a real website that matches the business identity.',
    helper: 'A visible web presence supports credibility and underwriting posture.',
    required: true,
    fieldGroup: 'contact',
  },
  {
    key: 'naics_classification',
    label: 'NAICS Validation',
    description: 'Validate or improve the business category for funding fit.',
    helper: 'Weak or risky NAICS choices can reduce fundability.',
    required: true,
    fieldGroup: 'naics',
  },
  {
    key: 'business_bank_account',
    label: 'Business Bank Account',
    description: 'Track business banking alignment for readiness.',
    helper: 'A business bank account supports separation and record consistency.',
    required: true,
    fieldGroup: 'banking',
  },
];

const EXISTING_BUSINESS_ITEMS: Array<Omit<BusinessFoundationItem, 'complete' | 'status'>> = [
  {
    key: 'review_current_setup',
    label: 'Current Setup Review',
    description: 'Confirm the current legal and operational foundation.',
    helper: 'Start with what already exists before optimizing fundability.',
    required: true,
    fieldGroup: 'formation',
  },
  {
    key: 'update_business_address',
    label: 'Business Address Review',
    description: 'Align the address used across formation, bank, and web presence.',
    helper: 'Address drift creates avoidable friction in readiness.',
    required: true,
    fieldGroup: 'identity',
  },
  {
    key: 'align_irs_ein',
    label: 'EIN Alignment',
    description: 'Confirm IRS/EIN records align with the business profile.',
    helper: 'The EIN should match your legal structure and records.',
    required: true,
    fieldGroup: 'identity',
  },
  {
    key: 'update_bank_records',
    label: 'Bank Record Alignment',
    description: 'Align business banking details with the operating profile.',
    helper: 'Clean bank records help with credibility and document consistency.',
    required: true,
    fieldGroup: 'banking',
  },
  {
    key: 'website_phone_consistency',
    label: 'Website And Phone Consistency',
    description: 'Keep the website and phone aligned across the business footprint.',
    helper: 'Lenders look for consistency across public and submitted records.',
    required: true,
    fieldGroup: 'consistency',
  },
  {
    key: 'final_consistency_check',
    label: 'Final Consistency Check',
    description: 'Confirm the business identity is consistent across key records.',
    helper: 'This is the last quality pass before deeper funding steps.',
    required: true,
    fieldGroup: 'consistency',
  },
];

const CREDIBILITY_ITEMS: Array<Omit<BusinessFoundationItem, 'complete' | 'status'>> = [
  {
    key: 'business_email',
    label: 'Business Email',
    description: 'Add an email tied to the business identity.',
    helper: 'A business-domain email improves professional presentation.',
    required: false,
    fieldGroup: 'credibility',
  },
  {
    key: 'mission_statement',
    label: 'Mission Statement',
    description: 'Define what the business does and who it serves.',
    helper: 'This supports website, applications, and opportunity matching.',
    required: false,
    fieldGroup: 'credibility',
  },
  {
    key: 'business_plan_summary',
    label: 'Business Plan',
    description: 'Store a short business plan summary or operating plan.',
    helper: 'This improves business clarity before deeper funding steps.',
    required: false,
    fieldGroup: 'credibility',
  },
];

function getProgressStatus(data: BusinessFoundationProfileResponse | null, key: string): StatusLike {
  const row = (data?.progress || []).find((item: any) => String(item?.step_key || '') === key);
  const status = String(row?.step_status || 'not_started');
  if (status === 'completed' || status === 'in_progress' || status === 'blocked') return status;
  return 'not_started';
}

function metadataValue(data: BusinessFoundationProfileResponse | null, key: string) {
  return String(data?.profile?.metadata?.[key] || '').trim();
}

function fieldComplete(data: BusinessFoundationProfileResponse | null, key: string) {
  const profile = data?.profile;
  if (!profile) return false;
  if (key === 'llc_setup') return Boolean(profile.legal_name && profile.entity_type);
  if (key === 'ein_setup' || key === 'align_irs_ein') return Boolean(profile.ein);
  if (key === 'business_address' || key === 'update_business_address') return Boolean(profile.business_address);
  if (key === 'business_phone') return Boolean(profile.business_phone);
  if (key === 'business_website') return Boolean(profile.business_website);
  if (key === 'naics_classification') return Boolean(profile.naics_code);
  if (key === 'business_email') return Boolean(metadataValue(data, 'business_email'));
  if (key === 'mission_statement') return Boolean(metadataValue(data, 'mission_statement'));
  if (key === 'business_plan_summary') return Boolean(metadataValue(data, 'business_plan_summary'));
  if (key === 'business_bank_account' || key === 'update_bank_records') {
    return Boolean(data?.supporting?.banking_profile?.bank_name || data?.supporting?.banking_profile?.account_type);
  }
  return false;
}

function itemStatus(data: BusinessFoundationProfileResponse | null, key: string): StatusLike {
  if (fieldComplete(data, key)) return 'completed';
  return getProgressStatus(data, key);
}

function hydrateItems(
  data: BusinessFoundationProfileResponse | null,
  baseItems: Array<Omit<BusinessFoundationItem, 'complete' | 'status'>>
): BusinessFoundationItem[] {
  return baseItems.map((item) => {
    const status = itemStatus(data, item.key);
    return {
      ...item,
      status,
      complete: status === 'completed',
    };
  });
}

export function currentPath(data: BusinessFoundationProfileResponse | null): BusinessFoundationPath | null {
  const path = data?.readiness.path;
  if (path === 'new_business' || path === 'existing_business_optimization') return path;
  return null;
}

export function foundationItems(data: BusinessFoundationProfileResponse | null) {
  const path = currentPath(data);
  const core = path === 'existing_business_optimization' ? EXISTING_BUSINESS_ITEMS : NEW_BUSINESS_ITEMS;
  return {
    path,
    coreItems: hydrateItems(data, core),
    credibilityItems: hydrateItems(data, CREDIBILITY_ITEMS),
  };
}

export function naicsReview(data: BusinessFoundationProfileResponse | null) {
  const current = String(data?.profile?.naics_code || '').trim();
  const highRisk = HIGH_RISK_NAICS.has(current);
  return {
    current,
    highRisk,
    suggestions: NAICS_SUGGESTIONS,
    warning: highRisk
      ? 'This NAICS code can be a weaker funding fit. Review a lower-risk service category.'
      : current
        ? 'This NAICS code is stored on the current profile. Review whether it is still the strongest funding fit.'
        : 'No NAICS code is stored yet. Choose a fundable category to strengthen readiness.',
  };
}
