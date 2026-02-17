import type { Contact } from '../types';

export interface RiskProfileDimensions {
  credit_volatility: number; // 0-25
  cash_flow_stability: number; // 0-25
  debt_load_pressure: number; // 0-20
  behavioral_stability: number; // 0-15
  external_fragility: number; // 0-15
}

export type RiskClassification = 'Stable' | 'Moderate Risk' | 'Elevated Risk' | 'High Fragility';

export interface RiskProfileResult {
  score: number; // 0-100 (higher = riskier)
  classification: RiskClassification;
  dimensions: RiskProfileDimensions;
  signals: string[];
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const round = (n: number) => Math.round(n);

const safeNumber = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function computeRiskProfile(contact: Contact): RiskProfileResult {
  const signals: string[] = [];

  // Credit Volatility (0-25)
  let creditVol = 0;
  const ca = contact.creditAnalysis;
  if (ca?.utilization !== undefined && Number.isFinite(ca.utilization)) {
    // High utilization implies volatility under stress.
    creditVol += clamp((ca.utilization - 30) / 70, 0, 1) * 10;
    if (ca.utilization > 50) signals.push('High utilization (credit volatility risk).');
  } else {
    creditVol += 6; // missing data implies uncertainty
    signals.push('Missing utilization data (volatility unknown).');
  }
  if (ca?.inquiries !== undefined && Number.isFinite(ca.inquiries)) {
    creditVol += clamp(ca.inquiries / 12, 0, 1) * 6;
    if (ca.inquiries >= 6) signals.push('Frequent inquiries (velocity risk).');
  }
  if (ca?.derogatoryMarks !== undefined && Number.isFinite(ca.derogatoryMarks)) {
    creditVol += clamp(ca.derogatoryMarks / 6, 0, 1) * 9;
    if (ca.derogatoryMarks > 0) signals.push('Derogatory marks present (volatility risk).');
  }
  creditVol = clamp(round(creditVol), 0, 25);

  // Cash Flow Stability (0-25)
  let cash = 0;
  const months = contact.financialSpreading?.months || [];
  if (months.length > 0) {
    const nsf = months.reduce((acc, m) => acc + (safeNumber(m.nsfCount) ?? 0), 0);
    const negDays = months.reduce((acc, m) => acc + (safeNumber(m.negativeDays) ?? 0), 0);
    cash += clamp(nsf / 8, 0, 1) * 12;
    cash += clamp(negDays / 10, 0, 1) * 13;
    if (nsf >= 3) signals.push('NSF pattern (cash flow fragility).');
    if (negDays >= 3) signals.push('Negative balance days (liquidity fragility).');
  } else {
    cash += 12;
    signals.push('Missing cash flow history (stability unknown).');
  }
  cash = clamp(round(cash), 0, 25);

  // Debt Load Pressure (0-20)
  // We don't have explicit debt/min-pay data in Contact; approximate with active deal balance vs revenue.
  let debt = 0;
  const active = contact.fundedDeals?.find((d) => d.status === 'Active');
  const revenue = safeNumber(contact.revenue) ?? 0;
  if (active && revenue > 0) {
    const monthlyPay = safeNumber(active.paymentAmount) ?? 0;
    const paymentRatio = monthlyPay / Math.max(revenue, 1);
    debt += clamp((paymentRatio - 0.08) / 0.25, 0, 1) * 16;
    if (paymentRatio > 0.18) signals.push('High payment-to-revenue ratio (debt pressure).');
  } else {
    debt += 8;
    signals.push('Debt pressure cannot be fully assessed (missing revenue/debt detail).');
  }
  if (ca?.utilization !== undefined && Number.isFinite(ca.utilization)) {
    debt += clamp(ca.utilization / 100, 0, 1) * 4;
  }
  debt = clamp(round(debt), 0, 20);

  // Behavioral Stability (0-15)
  // Proxy signals: repeated pending tasks, unrealistic velocity flags, repeated submissions.
  let beh = 0;
  const pendingTasks = contact.clientTasks?.filter((t) => t.status === 'pending').length ?? 0;
  beh += clamp(pendingTasks / 8, 0, 1) * 6;
  if (pendingTasks >= 5) signals.push('Many pending tasks (execution risk).');

  const submissions = contact.submissions?.length ?? 0;
  beh += clamp(submissions / 8, 0, 1) * 5;
  if (submissions >= 5) signals.push('High application velocity (behavioral risk).');

  if (contact.automationMetadata?.sentiment === 'Agitated' || contact.automationMetadata?.sentiment === 'Critical') {
    beh += 4;
    signals.push('Elevated friction sentiment (stability risk).');
  }
  beh = clamp(round(beh), 0, 15);

  // External Fragility (0-15)
  let ext = 0;
  if (contact.compliance?.riskScore === 'High') {
    ext += 10;
    signals.push('Compliance risk: High (external fragility).');
  } else if (contact.compliance?.riskScore === 'Medium') {
    ext += 6;
    signals.push('Compliance risk: Medium (external fragility).');
  }

  if (!contact.businessProfile?.address || !contact.businessProfile?.state) {
    ext += 3;
    signals.push('Incomplete business identity details (external fragility).');
  }

  if (!Array.isArray(contact.connectedBanks) || contact.connectedBanks.length === 0) {
    ext += 2;
  }
  ext = clamp(round(ext), 0, 15);

  const dimensions: RiskProfileDimensions = {
    credit_volatility: creditVol,
    cash_flow_stability: cash,
    debt_load_pressure: debt,
    behavioral_stability: beh,
    external_fragility: ext,
  };

  const score = clamp(round(creditVol + cash + debt + beh + ext), 0, 100);

  const classification: RiskClassification =
    score >= 70 ? 'High Fragility' : score >= 50 ? 'Elevated Risk' : score >= 30 ? 'Moderate Risk' : 'Stable';

  return {
    score,
    classification,
    dimensions,
    signals: Array.from(new Set(signals)).slice(0, 10),
  };
}
