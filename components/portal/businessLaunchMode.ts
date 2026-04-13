import { BusinessFoundationProfileResponse } from '../../services/fundingFoundationService';
import { BusinessFoundationPath, NAICS_SUGGESTIONS } from './businessFoundationConfig';

export type NewBusinessLaunchInput = {
  owner_name: string;
  business_idea: string;
  focus: string;
  target_market: string;
  state_formed: string;
};

export type ExistingBusinessLaunchInput = {
  business_name: string;
  entity_type: string;
  state_formed: string;
  business_start_date: string;
  industry: string;
  current_naics: string;
  website: string;
  business_email: string;
  business_phone: string;
  business_address: string;
  ein_status: string;
  entity_status: string;
  monthly_revenue_range: string;
  business_description: string;
};

export type NewBusinessLaunchResult = {
  generated_at: string;
  business_name: string;
  category: string;
  naics_code: string;
  mission_statement: string;
  business_description: string;
  services: string[];
  pricing_model: string;
  business_plan_summary: string;
  website_preview: {
    hero: string;
    about: string;
    services: string[];
    contact: string;
  };
  domain_suggestions: string[];
  business_email_suggestions: string[];
  funding_range: {
    min: number | null;
    max: number | null;
    gated: boolean;
    helper: string;
  };
  recommended_opportunity: string;
  next_best_action: string;
};

export type ExistingBusinessLaunchResult = {
  generated_at: string;
  fundability_review: string;
  naics_review: string;
  missing_foundation_items: string[];
  funding_readiness_relevance: string;
  opportunity_relevance: string;
  grant_relevance: string;
  website_preview: {
    hero: string;
    about: string;
    services: string[];
    contact: string;
  };
  domain_suggestions: string[];
  business_email_suggestions: string[];
  next_best_action: string;
};

export type BusinessIdentityPreview = {
  path: BusinessFoundationPath;
  business_name: string;
  website_preview: {
    hero: string;
    about: string;
    services: string[];
    contact: string;
  };
  domain_suggestions: string[];
  business_email_suggestions: string[];
};

export type LaunchModeSnapshot = {
  mode: BusinessFoundationPath;
  new_business_input?: NewBusinessLaunchInput;
  new_business_result?: NewBusinessLaunchResult;
  existing_business_input?: ExistingBusinessLaunchInput;
  existing_business_result?: ExistingBusinessLaunchResult;
  website_identity?: {
    selected_domain?: string;
    selected_email?: string;
    website_preview?: {
      hero?: string;
      about?: string;
      services?: string[];
      contact?: string;
    };
    last_updated_at?: string;
  };
};

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function categorySuggestion(focus: string, idea: string) {
  const haystack = `${focus} ${idea}`.toLowerCase();
  if (haystack.includes('coach') || haystack.includes('consult') || haystack.includes('advisor')) {
    return NAICS_SUGGESTIONS[0];
  }
  if (haystack.includes('course') || haystack.includes('training') || haystack.includes('educ')) {
    return NAICS_SUGGESTIONS[1];
  }
  return NAICS_SUGGESTIONS[2];
}

function revenueBandText(range: string) {
  const normalized = range.toLowerCase();
  if (normalized.includes('25') || normalized.includes('50') || normalized.includes('100')) {
    return 'There is enough commercial activity to support stronger opportunity and funding relevance.';
  }
  if (normalized.includes('10') || normalized.includes('15')) {
    return 'There is some revenue traction, but operational consistency still matters before deeper funding moves.';
  }
  return 'This profile still needs stronger operating and credibility signals before aggressive funding steps.';
}

export function readLaunchSnapshot(data: BusinessFoundationProfileResponse | null): LaunchModeSnapshot | null {
  const snapshot = data?.profile?.metadata?.launch_mode;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  return snapshot as LaunchModeSnapshot;
}

export function buildNewBusinessLaunchResult(input: NewBusinessLaunchInput): NewBusinessLaunchResult {
  const ownerName = titleCase(input.owner_name || 'Nexus Founder');
  const idea = titleCase(input.business_idea || 'Business Services');
  const focus = titleCase(input.focus || 'Consulting');
  const market = titleCase(input.target_market || 'Small Business Owners');
  const state = titleCase(input.state_formed || 'Arizona');
  const category = categorySuggestion(input.focus, input.business_idea);
  const rootName = ownerName.split(' ')[0] || 'Nexus';
  const businessName = `${rootName} ${focus}`.trim();
  const mission = `Help ${market.toLowerCase()} unlock better business outcomes through ${focus.toLowerCase()} that is simple, credible, and funding-ready.`;
  const services = [
    `${focus} strategy sessions`,
    `${idea} setup and implementation`,
    'Monthly optimization support',
  ];
  const pricingModel = 'Starter setup fee + monthly advisory retainer + premium implementation tier';
  const slug = slugify(businessName) || 'launchmode';

  return {
    generated_at: new Date().toISOString(),
    business_name: businessName,
    category: category.label,
    naics_code: category.code,
    mission_statement: mission,
    business_description: `${businessName} is a ${category.label.toLowerCase()} business focused on serving ${market.toLowerCase()} with a clear, low-overhead offer in ${state}.`,
    services,
    pricing_model: pricingModel,
    business_plan_summary: `${businessName} launches with a service-first offer, lean delivery model, and a credibility stack designed to support faster readiness. Phase one centers on ${services[0].toLowerCase()}, then expands into retainers and scalable fulfillment.`,
    website_preview: {
      hero: `${businessName} helps ${market.toLowerCase()} move faster with ${focus.toLowerCase()} that is practical, premium, and results-driven.`,
      about: `${businessName} was built to give ${market.toLowerCase()} a clean, modern service partner with clear positioning and strong execution.`,
      services,
      contact: `Book a strategy call with ${businessName} to review goals, timing, and next steps.`,
    },
    domain_suggestions: [
      `${slug}.com`,
      `get${slug}.com`,
      `${slug}group.com`,
    ],
    business_email_suggestions: [
      `hello@${slug}.com`,
      `team@${slug}.com`,
      `start@${slug}.com`,
    ],
    funding_range: {
      min: null,
      max: null,
      gated: true,
      helper: 'Complete credit upload and readiness steps to unlock an educational estimate.',
    },
    recommended_opportunity: `Start with a ${category.label.toLowerCase()} offer that can be launched quickly and paired with service-based cash flow.`,
    next_best_action: 'Save this launch draft, then apply it into Business Foundation to begin entity, EIN, website, and NAICS setup.',
  };
}

export function buildExistingBusinessLaunchResult(input: ExistingBusinessLaunchInput): ExistingBusinessLaunchResult {
  const missing: string[] = [];
  if (!input.website) missing.push('Website');
  if (!input.business_email) missing.push('Business Email');
  if (!input.business_phone) missing.push('Business Phone');
  if (!input.business_address) missing.push('Business Address');
  if (!input.current_naics) missing.push('NAICS Validation');
  if (!input.ein_status || input.ein_status.toLowerCase().includes('no')) missing.push('EIN');
  if (!input.entity_status || input.entity_status.toLowerCase().includes('not')) missing.push('Entity Validation');

  const highRiskNaics = new Set(['713210', '522298', '812990']).has(input.current_naics.trim());
  const naicsReview = input.current_naics
    ? highRiskNaics
      ? 'Current NAICS looks weaker for funding fit. Review a lower-risk service category if the business model allows it.'
      : 'Current NAICS is present. Validate whether it still reflects the most fundable version of the business.'
    : 'No NAICS is stored yet, so category alignment is still missing.';
  const name = titleCase(input.business_name || 'Existing Business');
  const industry = titleCase(input.industry || 'Professional Services');
  const slug = slugify(name) || 'existingbusiness';
  const services = [
    `${industry} advisory`,
    `${industry} implementation support`,
    'Ongoing client service and fulfillment',
  ];

  return {
    generated_at: new Date().toISOString(),
    fundability_review: `${titleCase(input.business_name || 'This business')} has an operating profile in ${titleCase(input.industry || 'its current category')}, but it still needs clean identity consistency, stronger profile completion, and documented readiness before deeper funding steps should be trusted.`,
    naics_review: naicsReview,
    missing_foundation_items: missing,
    funding_readiness_relevance: revenueBandText(input.monthly_revenue_range || ''),
    opportunity_relevance: 'Once the business identity is aligned, Nexus can connect this company to opportunity, funding, and growth paths that fit its current operating stage.',
    grant_relevance: 'Grant fit improves once the business description, mission, NAICS, and website are consistent enough to support narrative-based applications.',
    website_preview: {
      hero: `${name} helps clients move forward with clear ${industry.toLowerCase()} support and a more credible operating presence.`,
      about: `${name} is positioned as a focused ${industry.toLowerCase()} business with a cleaner identity layer built for credibility, funding readiness, and client trust.`,
      services,
      contact: `Connect with ${name} to review goals, current operations, and the next business readiness move.`,
    },
    domain_suggestions: [
      `${slug}.com`,
      `${slug}co.com`,
      `workwith${slug}.com`,
    ],
    business_email_suggestions: [
      `hello@${slug}.com`,
      `support@${slug}.com`,
      `team@${slug}.com`,
    ],
    next_best_action: missing.length > 0
      ? `Complete ${missing[0]} first, then continue through the remaining foundation gaps.`
      : 'Profile data is mostly present. Continue into funding readiness review and opportunity matching.',
  };
}

export function deriveIdentityPreview(data: BusinessFoundationProfileResponse | null): BusinessIdentityPreview | null {
  const snapshot = readLaunchSnapshot(data);
  if (!snapshot) return null;

  if (snapshot.mode === 'new_business' && snapshot.new_business_result) {
    return {
      path: 'new_business',
      business_name: snapshot.new_business_result.business_name,
      website_preview: {
        ...snapshot.new_business_result.website_preview,
        ...snapshot.website_identity?.website_preview,
      },
      domain_suggestions: snapshot.new_business_result.domain_suggestions,
      business_email_suggestions: snapshot.new_business_result.business_email_suggestions,
    };
  }

  if (snapshot.mode === 'existing_business_optimization' && snapshot.existing_business_result) {
    return {
      path: 'existing_business_optimization',
      business_name: String(
        snapshot.existing_business_input?.business_name
        || data?.profile?.legal_name
        || 'Existing Business'
      ),
      website_preview: {
        ...snapshot.existing_business_result.website_preview,
        ...snapshot.website_identity?.website_preview,
      },
      domain_suggestions: snapshot.existing_business_result.domain_suggestions,
      business_email_suggestions: snapshot.existing_business_result.business_email_suggestions,
    };
  }

  return null;
}
