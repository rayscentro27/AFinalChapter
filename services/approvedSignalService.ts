import { supabase } from '../lib/supabaseClient';
import { resolveTenantIdForUser } from '../utils/tenantContext';

const BASE = '/.netlify/functions';

type SignalAssetType = 'forex' | 'options';

type RawSignalRow = {
  id: string;
  proposal_key?: string;
  strategy_id?: string;
  asset_type?: SignalAssetType;
  symbol?: string;
  timeframe?: string;
  side?: string;
  confidence?: number;
  confidence_band?: string;
  status?: string;
  decision?: string;
  approval_status?: string;
  summary?: string;
  rationale?: string;
  source_trace_id?: string;
  meta?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

type SignalListResponse = {
  ok: boolean;
  count: number;
  items: RawSignalRow[];
  error?: string;
};

export type ApprovedSignalSummary = {
  id: string;
  title: string;
  assetType: SignalAssetType;
  symbolLabel: string;
  timeframeLabel: string;
  sideLabel: string;
  confidenceLabel: string;
  summary: string;
  rationale: string;
  caution: string;
  tags: string[];
  createdAtLabel: string;
};

function fmtPct(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'N/A';
  const numeric = Number(value);
  const normalized = numeric <= 1 && numeric >= -1 ? numeric * 100 : numeric;
  return `${normalized.toFixed(1)}% confidence`;
}

function fmtDate(value?: string) {
  if (!value) return 'Recently approved';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently approved';
  return `Approved ${date.toLocaleDateString()}`;
}

function normalizeSide(side?: string) {
  const normalized = String(side || '').trim();
  return normalized ? normalized.toUpperCase() : 'Directional';
}

function normalizeConfidenceBand(value?: string) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.replace(/_/g, ' ') : 'Reviewed';
}

function normalizeSignal(row: RawSignalRow): ApprovedSignalSummary {
  const assetType = row.asset_type || 'forex';
  const title = String(row.strategy_id || `${normalizeSide(row.side)} ${row.symbol || 'signal'}`).trim();
  const confidenceBand = normalizeConfidenceBand(row.confidence_band);

  return {
    id: String(row.id),
    title,
    assetType,
    symbolLabel: String(row.symbol || 'Multi-symbol'),
    timeframeLabel: String(row.timeframe || 'Not specified'),
    sideLabel: normalizeSide(row.side),
    confidenceLabel: row.confidence !== undefined && row.confidence !== null ? fmtPct(row.confidence) : confidenceBand,
    summary: String(row.summary || 'Approved signal available for educational review.'),
    rationale: String(row.rationale || 'Review the upstream approval context before using this signal in any paper-trading exercise.'),
    caution: 'Signals remain educational and proposal-based. Use them to study timing and logic, not as live trade instructions.',
    tags: [assetType === 'options' ? 'Options' : 'Forex', normalizeSide(row.side), confidenceBand],
    createdAtLabel: fmtDate(row.created_at || row.updated_at),
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
    throw new Error('Sign in required to access approved signal content.');
  }

  const tenantId = await resolveTenantIdForUser(userId);
  if (!tenantId) {
    throw new Error('No tenant membership found for approved signal content.');
  }

  return { accessToken, tenantId };
}

export async function listApprovedSignals(limit = 10): Promise<ApprovedSignalSummary[]> {
  const { accessToken, tenantId } = await resolveRequestContext();
  const query = new URLSearchParams({
    tenant_id: tenantId,
    limit: String(limit),
  });

  const payload = await requestJson<SignalListResponse>(`${BASE}/portal-approved-signals?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return (Array.isArray(payload.items) ? payload.items : []).map(normalizeSignal);
}