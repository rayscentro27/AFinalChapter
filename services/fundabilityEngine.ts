import type { Contact } from '../types';

export type FundabilityBand = 'Red' | 'Amber' | 'Blue' | 'Emerald';
export type CRILabel = 'Build' | 'Repair' | 'Prepare' | 'Deploy';

export interface FundabilityBreakdownItem {
  category: 'Business Structure' | 'Infrastructure' | 'Credit Profile' | 'Financial Stability' | 'Risk Factors';
  score: number; // can be negative for Risk Factors
  max: number;
  status: 'Stable' | 'Needs Optimization' | 'Repair' | 'Monitor';
}

export interface FundabilityResult {
  fundability_score: number; // 0-100
  band: FundabilityBand;
  cri: CRILabel;
  breakdown: FundabilityBreakdownItem[];
  improvement_tasks: string[];
  eligibility_band: string;
  note: string;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const round = (n: number) => Math.round(n);

const bandForScore = (score: number): FundabilityBand => {
  if (score < 55) return 'Red';
  if (score < 70) return 'Amber';
  if (score < 85) return 'Blue';
  return 'Emerald';
};

const criForScore = (score: number): CRILabel => {
  if (score >= 85) return 'Deploy';
  if (score >= 70) return 'Prepare';
  if (score >= 55) return 'Repair';
  return 'Build';
};

const statusForRatio = (ratio: number): FundabilityBreakdownItem['status'] => {
  if (ratio >= 0.85) return 'Stable';
  if (ratio >= 0.7) return 'Monitor';
  if (ratio >= 0.55) return 'Needs Optimization';
  return 'Repair';
};

const safeNumber = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function computeFundability(contact: Contact): FundabilityResult {
  const tasks: string[] = [];

  // Business Structure (0-25)
  let structure = 0;
  const bp = contact.businessProfile;
  if (bp?.legalName) structure += 6;
  if (bp?.taxId) structure += 6;
  if (bp?.structure && !/sole\s*prop/i.test(bp.structure)) structure += 5;
  if (bp?.website) structure += 4;
  if (safeNumber(contact.timeInBusiness) !== undefined) {
    const tib = contact.timeInBusiness as number;
    structure += clamp(tib / 24, 0, 1) * 4;
  } else {
    tasks.push('Add time-in-business and entity details (Business Profile).');
  }
  structure = clamp(round(structure), 0, 25);

  if (!bp?.website) tasks.push('Add business website (domain + basic presence).');
  if (!bp?.taxId) tasks.push('Confirm EIN/Tax ID and entity structure.');

  // Infrastructure (0-20)
  let infra = 0;
  if (Array.isArray(contact.connectedBanks) && contact.connectedBanks.length > 0) infra += 8;
  else tasks.push('Connect operating bank account (for cash flow stability signals).');

  if (contact.financialSpreading?.months?.length) infra += 6;
  else tasks.push('Upload bank statements or enable transaction spreading (3+ months).');

  if (contact.compliance?.kycStatus === 'Verified') infra += 3;
  else tasks.push('Complete identity verification (KYC).');

  if (contact.compliance?.kybStatus === 'Verified') infra += 3;
  else tasks.push('Complete business verification (KYB).');

  infra = clamp(round(infra), 0, 20);

  // Credit Profile (0-25)
  let credit = 0;
  const ca = contact.creditAnalysis;
  if (ca?.score && Number.isFinite(ca.score)) {
    credit += clamp(((ca.score - 500) / (850 - 500)) * 16, 0, 16); // 500..850 => 0..16
  } else {
    tasks.push('Add credit score + utilization snapshot (Credit Analysis).');
  }
  if (ca?.utilization !== undefined && Number.isFinite(ca.utilization)) {
    // utilization is 0..100
    credit += clamp((30 - ca.utilization) / 30, 0, 1) * 5; // best under 30%
    if (ca.utilization > 30) tasks.push('Reduce revolving utilization under 30%.');
  }
  if (ca?.derogatoryMarks !== undefined && Number.isFinite(ca.derogatoryMarks)) {
    const d = ca.derogatoryMarks;
    credit += clamp(1 - d / 6, 0, 1) * 4;
    if (d > 0) tasks.push('Resolve or validate derogatory items/collections.');
  }
  credit = clamp(round(credit), 0, 25);

  // Financial Stability (0-15)
  let fin = 0;
  const revenue = safeNumber(contact.revenue) ?? 0;
  if (revenue > 0) fin += clamp(revenue / 20000, 0, 1) * 4;

  const months = contact.financialSpreading?.months || [];
  if (months.length > 0) {
    const nsf = months.reduce((acc, m) => acc + (safeNumber(m.nsfCount) ?? 0), 0);
    const negDays = months.reduce((acc, m) => acc + (safeNumber(m.negativeDays) ?? 0), 0);
    fin += clamp(1 - nsf / 8, 0, 1) * 6;
    fin += clamp(1 - negDays / 10, 0, 1) * 5;
    if (nsf >= 3) tasks.push('Eliminate NSF events (aim: 0 across last 90 days).');
    if (negDays >= 3) tasks.push('Prevent negative balance days (tighten reserve buffer).');
  } else {
    tasks.push('Provide cash flow history to score stability (bank statements/spreading).');
  }
  fin = clamp(round(fin), 0, 15);

  // Risk Factors (-15..0)
  let risk = 0;
  if (ca?.inquiries !== undefined && Number.isFinite(ca.inquiries)) {
    const inq = ca.inquiries;
    risk -= clamp(inq / 12, 0, 1) * 5;
    if (inq >= 6) tasks.push('Pause new credit inquiries (stabilize velocity).');
  }
  if (months.length > 0) {
    const nsf = months.reduce((acc, m) => acc + (safeNumber(m.nsfCount) ?? 0), 0);
    if (nsf >= 5) risk -= 6;
  }
  if (ca?.status && /late|delinquent|default/i.test(ca.status)) risk -= 4;
  risk = clamp(round(risk), -15, 0);

  const breakdown: FundabilityBreakdownItem[] = [
    {
      category: 'Business Structure',
      score: structure,
      max: 25,
      status: statusForRatio(structure / 25),
    },
    {
      category: 'Infrastructure',
      score: infra,
      max: 20,
      status: statusForRatio(infra / 20),
    },
    {
      category: 'Credit Profile',
      score: credit,
      max: 25,
      status: statusForRatio(credit / 25),
    },
    {
      category: 'Financial Stability',
      score: fin,
      max: 15,
      status: statusForRatio(fin / 15),
    },
    {
      category: 'Risk Factors',
      score: risk,
      max: 0,
      status: risk <= -10 ? 'Repair' : risk <= -5 ? 'Needs Optimization' : 'Monitor',
    },
  ];

  // Total score: sum of positive categories + (negative) risk adjustment.
  const total = clamp(structure + infra + credit + fin + risk, 0, 100);
  const score = round(total);

  const eligibility =
    score >= 85
      ? 'Currently aligned with: Institutional-ready (educational)'
      : score >= 70
        ? 'Currently aligned with: Standard programs (educational)'
        : score >= 55
          ? 'Currently aligned with: Conditional programs (educational)'
          : 'Currently aligned with: Credit-building / microloan path (educational)';

  // Deduplicate tasks while preserving order.
  const improvement_tasks = Array.from(new Set(tasks)).slice(0, 12);

  return {
    fundability_score: score,
    band: bandForScore(score),
    cri: criForScore(score),
    breakdown,
    improvement_tasks,
    eligibility_band: eligibility,
    note:
      'Score reflects structural, credit, and financial signals for education and progress tracking; it is not an approval guarantee.',
  };
}
