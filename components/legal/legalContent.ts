export const LEGAL_COMPANY_PLACEHOLDER = '[Company Name]';
export const LEGAL_SUPPORT_EMAIL_PLACEHOLDER = '[Support Email]';

export const DISCLAIMER_BULLETS: string[] = [
  `General: ${LEGAL_COMPANY_PLACEHOLDER} provides educational content and workflow tools only. We are not a law firm, accounting firm, or financial advisory firm. No guarantees of outcomes are made.`,
  'Credit repair: We provide FCRA education and documentation templates. We are not a CROA credit repair organization and do not promise deletion of any item.',
  'Funding: Lender decisions are made solely by lenders. No approval or funding amount is guaranteed. Commission disclosures are provided separately before fee-bearing services.',
  'Investment: Educational material only. Nothing is investment advice or a recommendation to buy, sell, or hold securities.',
  `Legal and tax: Consult licensed legal and tax professionals for advice specific to your situation.`,
  'Grants and SBA: Eligibility and awards are determined by program administrators and lenders. No grant or SBA outcome is guaranteed.',
];

export const TERMS_SECTIONS = [
  {
    title: 'Educational Platform Scope',
    body: `${LEGAL_COMPANY_PLACEHOLDER} provides educational resources, templates, and workflow tools. The platform does not provide legal, tax, accounting, investment, or lending decisions and does not guarantee specific outcomes.`,
  },
  {
    title: 'No Guarantees',
    body: 'Outcomes vary by user, lender, program criteria, and market conditions. You acknowledge there are no promises of approvals, funding, deletions, or timeline commitments.',
  },
  {
    title: 'User Responsibilities',
    body: 'You are responsible for the accuracy of submitted information, document integrity, and lawful use of the platform.',
  },
  {
    title: 'Communications',
    body: `Transactional email communications are required for account and workflow operations. Marketing communications are optional where offered. Contact ${LEGAL_SUPPORT_EMAIL_PLACEHOLDER} for support.`,
  },
  {
    title: 'Limitation of Liability',
    body: `${LEGAL_COMPANY_PLACEHOLDER} is not liable for lender or third-party decisions, delays, denials, or external service outages.`,
  },
];

export const PRIVACY_SECTIONS = [
  {
    title: 'Data We Process',
    body: 'Account profile data, workflow records, communication preferences, and uploaded materials needed to deliver the service.',
  },
  {
    title: 'How Data Is Used',
    body: 'To operate your workspace, generate educational outputs, improve reliability, maintain security, and comply with legal obligations.',
  },
  {
    title: 'Data Sharing',
    body: 'Data may be shared with infrastructure providers and integrated services strictly as needed to run requested platform functionality.',
  },
  {
    title: 'Retention and Deletion',
    body: 'Data is retained based on service and compliance needs. You may request account deletion per policy and legal requirements.',
  },
  {
    title: 'Contact',
    body: `Privacy requests and concerns can be directed to ${LEGAL_SUPPORT_EMAIL_PLACEHOLDER}.`,
  },
];

export const AI_DISCLOSURE_SECTIONS = [
  {
    title: 'AI Assistance Notice',
    body: 'The platform uses AI to generate drafts, summaries, and recommendations. AI output may be incomplete or incorrect and must be reviewed by a human before use.',
  },
  {
    title: 'Human Review Requirement',
    body: 'You are responsible for verifying all generated content before submission or action.',
  },
  {
    title: 'Regulated Advice Exclusion',
    body: 'AI output is educational and operational support only; it is not legal, tax, accounting, or investment advice.',
  },
];

export const REFUND_POLICY_SECTIONS = [
  {
    title: 'Membership and Service Fees',
    body: 'Subscription fees are for platform access and operational support features provided during the billing period.',
  },
  {
    title: 'No Performance-Based Refunds',
    body: 'Refunds are not based on credit outcomes, funding outcomes, grant outcomes, or timeline outcomes.',
  },
  {
    title: 'Cancellation',
    body: 'You may cancel recurring plans to stop future renewals. Access remains active through the current billing period unless otherwise stated.',
  },
  {
    title: 'Support',
    body: `For billing support, contact ${LEGAL_SUPPORT_EMAIL_PLACEHOLDER}.`,
  },
];
