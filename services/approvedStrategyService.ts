import { supabase } from '../lib/supabaseClient';
import { resolveTenantIdForUser } from '../utils/tenantContext';

const BASE = '/.netlify/functions';

type StrategyAssetType = 'forex' | 'options';

type RawStrategyRow = {
  id: string;
  portal_id: string;
  strategy_id?: string;
  asset_type: StrategyAssetType;
  symbol?: string;
  timeframe?: string;
  underlying_symbol?: string;
  structure_type?: string;
  trades_total?: number;
  win_rate?: number;
  profit_factor?: number;
  net_pnl?: number;
  max_drawdown?: number;
  sharpe?: number;
  confidence_band?: string;
  status?: string;
  decision?: string;
  approval_status?: string;
  created_at?: string;
  rank?: number;
};

type StrategyListResponse = {
  ok: boolean;
  tenant_id: string;
  count: number;
  items: RawStrategyRow[];
  error?: string;
};

type StrategyDetailResponse = {
  ok: boolean;
  tenant_id: string;
  item: RawStrategyRow;
  error?: string;
};

export type ApprovedStrategySummary = {
  id: string;
  recordId: string;
  assetType: StrategyAssetType;
  title: string;
  category: string;
  symbolLabel: string;
  timeframeLabel: string;
  structureLabel: string;
  rankLabel: string;
  confidenceLabel: string;
  statusLabel: string;
  winRateLabel: string;
  profitFactorLabel: string;
  maxDrawdownLabel: string;
  netPnlLabel: string;
  tradeCountLabel: string;
  educationalSummary: string;
  educationalFocus: string;
  caution: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  tags: string[];
  createdAtLabel: string;
};

export type ApprovedStrategyDetail = ApprovedStrategySummary & {
  checklist: string[];
  suitability: string[];
  riskNotes: string[];
};

function fmtPct(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'N/A';
  const numeric = Number(value);
  const normalized = numeric <= 1 && numeric >= -1 ? numeric * 100 : numeric;
  return `${normalized.toFixed(1)}%`;
}

function fmtNum(value?: number | null, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'N/A';
  return Number(value).toFixed(digits);
}

function fmtSigned(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'N/A';
  const numeric = Number(value);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}`;
}

function fmtDate(value?: string) {
  if (!value) return 'Recently updated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  return `Updated ${date.toLocaleDateString()}`;
}

function toConfidenceLabel(value?: string) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.replace(/_/g, ' ') : 'Under review';
}

function toRiskLevel(row: RawStrategyRow): 'Low' | 'Medium' | 'High' {
  const drawdown = Number(row.max_drawdown ?? NaN);
  const confidence = String(row.confidence_band || '').toLowerCase();
  if ((!Number.isNaN(drawdown) && drawdown >= 0.2) || confidence.includes('low')) return 'High';
  if ((!Number.isNaN(drawdown) && drawdown >= 0.1) || confidence.includes('medium')) return 'Medium';
  return 'Low';
}

function buildSummary(row: RawStrategyRow): ApprovedStrategySummary {
  const assetType = row.asset_type;
  const symbolLabel = assetType === 'options'
    ? String(row.underlying_symbol || row.symbol || 'Multi-symbol options')
    : String(row.symbol || 'Multi-pair forex');
  const structureLabel = assetType === 'options'
    ? String(row.structure_type || row.strategy_id || 'Options structure')
    : 'Paper-traded forex setup';
  const confidenceLabel = toConfidenceLabel(row.confidence_band);
  const riskLevel = toRiskLevel(row);
  const title = String(row.strategy_id || structureLabel || 'Approved strategy');
  const educationalFocus = assetType === 'options'
    ? `Review structure logic on ${symbolLabel} before any paper trade.`
    : `Study the ${String(row.timeframe || 'active')} setup on ${symbolLabel} before simulation.`;
  const caution = riskLevel === 'High'
    ? 'Higher drawdown profile. Use slower paper-trade pacing and tighter journaling.'
    : riskLevel === 'Medium'
    ? 'Moderate variability. Keep sizing hypothetical and validate consistency before advancing.'
    : 'Lower relative drawdown, but still educational-only and simulation-first.';

  return {
    id: String(row.portal_id || `${assetType}:${row.id}`),
    recordId: String(row.id),
    assetType,
    title,
    category: assetType === 'options' ? 'Approved Options Structure' : 'Approved Forex Strategy',
    symbolLabel,
    timeframeLabel: String(row.timeframe || (assetType === 'options' ? 'Structure dependent' : 'Not specified')),
    structureLabel,
    rankLabel: row.rank ? `Rank ${row.rank}` : 'Rank pending',
    confidenceLabel,
    statusLabel: String(row.approval_status || 'approved').replace(/_/g, ' '),
    winRateLabel: fmtPct(row.win_rate),
    profitFactorLabel: fmtNum(row.profit_factor),
    maxDrawdownLabel: fmtPct(row.max_drawdown),
    netPnlLabel: fmtSigned(row.net_pnl),
    tradeCountLabel: String(row.trades_total ?? 'N/A'),
    educationalSummary: assetType === 'options'
      ? `${title} is approved for educational review with ${fmtPct(row.win_rate)} win rate and ${fmtNum(row.profit_factor)} profit factor across ${row.trades_total ?? 'an unspecified number of'} observed trades.`
      : `${title} is approved for educational review on ${symbolLabel} with ${fmtPct(row.win_rate)} win rate and ${fmtNum(row.profit_factor)} profit factor across ${row.trades_total ?? 'an unspecified number of'} observed trades.`,
    educationalFocus,
    caution,
    riskLevel,
    tags: [
      assetType === 'options' ? 'Options' : 'Forex',
      confidenceLabel,
      riskLevel === 'High' ? 'Higher Drawdown' : riskLevel === 'Medium' ? 'Moderate Drawdown' : 'Lower Drawdown',
    ],
    createdAtLabel: fmtDate(row.created_at),
  };
}

function buildDetail(row: RawStrategyRow): ApprovedStrategyDetail {
  const summary = buildSummary(row);
  return {
    ...summary,
    checklist: [
      `Review the approval record and evidence for ${summary.title}.`,
      `Paper trade the setup on ${summary.symbolLabel} before considering any live exposure.`,
      `Log entry conditions, invalidation, and exit rules in a journal before each simulation run.`,
    ],
    suitability: [
      summary.assetType === 'options' ? 'Best treated as a structure-study module for defined setups.' : 'Best treated as a rules-based forex replay module.',
      `Use when you want to study ${summary.confidenceLabel.toLowerCase()} strategies without leaving the funding-first workflow.`,
      'Keep this secondary to business-growth priorities and reserve planning.',
    ],
    riskNotes: [
      `Observed max drawdown: ${summary.maxDrawdownLabel}.`,
      `Observed profit factor: ${summary.profitFactorLabel}.`,
      summary.caution,
    ],
  };
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(String(payload?.error || `Request failed (${response.status})`));
  }

  return payload as T;
}

async function resolveRequestContext() {
  const [{ data: sessionData }, { data: userData }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  const accessToken = String(sessionData.session?.access_token || '').trim();
  const userId = String(userData.user?.id || '').trim();
  if (!accessToken || !userId) {
    throw new Error('Sign in required to access approved strategy content.');
  }

  const tenantId = await resolveTenantIdForUser(userId);
  if (!tenantId) {
    throw new Error('No tenant membership found for approved strategy content.');
  }

  return { accessToken, tenantId };
}

export async function listApprovedStrategies(limit = 12): Promise<ApprovedStrategySummary[]> {
  const { accessToken, tenantId } = await resolveRequestContext();
  const query = new URLSearchParams({
    tenant_id: tenantId,
    limit: String(limit),
  });

  const payload = await requestJson<StrategyListResponse>(`${BASE}/portal-approved-strategies?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return (Array.isArray(payload.items) ? payload.items : []).map(buildSummary);
}

export async function getApprovedStrategyDetail(input: {
  recordId: string;
  assetType: StrategyAssetType;
}): Promise<ApprovedStrategyDetail> {
  const { accessToken, tenantId } = await resolveRequestContext();
  const query = new URLSearchParams({
    tenant_id: tenantId,
    record_id: input.recordId,
    asset_type: input.assetType,
  });

  const payload = await requestJson<StrategyDetailResponse>(`${BASE}/portal-approved-strategy?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!payload.item) {
    throw new Error('Approved strategy detail was empty.');
  }

  return buildDetail(payload.item);
}