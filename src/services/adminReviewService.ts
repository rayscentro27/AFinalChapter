import { supabase } from '../../lib/supabaseClient';

export type ReviewDomain = 'strategies' | 'signals';
export type ReviewTargetType = 'strategy' | 'signal';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type PublishStatus = 'published' | 'unpublished';
export type ExpirationStatus = 'active' | 'expired';
export type ReviewAction = 'approve' | 'reject' | 'publish' | 'unpublish' | 'expire';

type LifecycleRow = {
  id?: string;
  approval_status?: string;
  status?: string;
  is_published?: boolean;
  published_at?: string | null;
  expires_at?: string | null;
  expired_at?: string | null;
  created_at?: string;
  updated_at?: string;
  meta?: Record<string, unknown>;
};

type StrategyRow = LifecycleRow & {
  strategy_id?: string;
  asset_type?: string;
  symbol?: string;
  timeframe?: string;
  underlying_symbol?: string;
  structure_type?: string;
  win_rate?: number;
  profit_factor?: number;
  net_pnl?: number;
  confidence_band?: string;
  rank?: number;
};

type SignalRow = LifecycleRow & {
  strategy_id?: string;
  asset_type?: string;
  symbol?: string;
  timeframe?: string;
  side?: string;
  confidence?: number;
  confidence_band?: string;
  summary?: string;
  rationale?: string;
};

type QueueRow = {
  id?: string;
  proposal_id?: string;
  strategy_id?: string;
  symbol?: string;
  status?: string;
  decision?: string;
  approval_status?: string;
  priority?: number;
  requested_by?: string;
  created_at?: string;
  notes?: string;
};

type DashboardPayload = {
  ok?: boolean;
  error?: string;
  tenant_id?: string;
  strategies?: StrategyRow[];
  options?: StrategyRow[];
  signals?: SignalRow[];
  queue?: QueueRow[];
};

type LifecycleMutationPayload = {
  id?: string;
  tenant_id?: string;
  target_type?: ReviewTargetType;
  approval_status?: string;
  status?: string;
  is_published?: boolean;
  published_at?: string | null;
  expires_at?: string | null;
  expired_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type LifecycleMutationResponse = {
  ok?: boolean;
  action?: 'publish' | 'unpublish' | 'expire';
  item?: LifecycleMutationPayload;
  error?: string;
  reason?: string;
  details?: Record<string, unknown>;
};

export type ReviewMetric = {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'warning';
};

export type ReviewItem = {
  id: string;
  itemId: string | null;
  targetType: ReviewTargetType | null;
  domain: ReviewDomain;
  title: string;
  subtitle: string;
  summary: string;
  reviewStatus: ReviewStatus;
  publishStatus: PublishStatus;
  expirationStatus: ExpirationStatus;
  confidenceLabel: string;
  difficultyLabel: string;
  riskLabel: string;
  directionLabel: string;
  setupTypeLabel: string;
  symbolLabel: string;
  reviewStatusLabel: string;
  publishStatusLabel: string;
  expirationLabel: string;
  createdAtLabel: string;
  createdAt: string;
  updatedAtLabel: string;
  updatedAt: string;
  queueId: string | null;
  notes: string;
  publishedAt: string | null;
  expiresAt: string | null;
  expiredAt: string | null;
  reviewFields: Array<{ label: string; value: string }>;
  actionSupport: {
    approveReject: boolean;
    publish: boolean;
    unpublish: boolean;
    expire: boolean;
  };
  operationalNotes: string[];
  latestMutationMessage: string | null;
};

export type ReviewDashboardData = {
  tenantId: string;
  metrics: ReviewMetric[];
  items: ReviewItem[];
};

function fmtPct(value: number | undefined | null) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'Not available';
  const numeric = Number(value);
  const normalized = numeric <= 1 && numeric >= -1 ? numeric * 100 : numeric;
  return `${normalized.toFixed(1)}%`;
}

function fmtNum(value: number | undefined | null, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'Not available';
  return Number(value).toFixed(digits);
}

function fmtDate(value?: string | null) {
  if (!value) return 'Recently updated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  return date.toLocaleString();
}

function text(value: unknown, fallback = 'Not available') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeConfidenceBand(value?: string) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.replace(/_/g, ' ') : 'Under review';
}

function normalizeReviewStatus(value?: string): ReviewStatus {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  return 'pending';
}

function buildReviewStatusLabel(value: ReviewStatus) {
  if (value === 'approved') return 'Approved';
  if (value === 'rejected') return 'Rejected';
  return 'Pending Review';
}

function toIsoOrNull(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function deriveExpiration(input: {
  expiresAt?: string | null;
  expiredAt?: string | null;
  meta?: Record<string, unknown> | null;
}) {
  const expiredAt = toIsoOrNull(input.expiredAt);
  if (expiredAt) {
    return {
      status: 'expired' as const,
      label: `Expired ${fmtDate(expiredAt)}`,
      expiresAt: toIsoOrNull(input.expiresAt),
      expiredAt,
    };
  }

  const directExpiry = toIsoOrNull(input.expiresAt);
  if (directExpiry) {
    const isExpired = new Date(directExpiry).getTime() <= Date.now();
    return {
      status: isExpired ? 'expired' as const : 'active' as const,
      label: isExpired ? `Expired ${fmtDate(directExpiry)}` : `Active until ${fmtDate(directExpiry)}`,
      expiresAt: directExpiry,
      expiredAt: null,
    };
  }

  const metaExpiry = String(input.meta?.expires_at || input.meta?.expiry_at || input.meta?.expiresAt || '').trim();
  const normalizedMetaExpiry = toIsoOrNull(metaExpiry || null);
  if (normalizedMetaExpiry) {
    const isExpired = new Date(normalizedMetaExpiry).getTime() <= Date.now();
    return {
      status: isExpired ? 'expired' as const : 'active' as const,
      label: isExpired ? `Expired ${fmtDate(normalizedMetaExpiry)}` : `Active until ${fmtDate(normalizedMetaExpiry)}`,
      expiresAt: normalizedMetaExpiry,
      expiredAt: null,
    };
  }

  return {
    status: 'active' as const,
    label: 'No expiration set',
    expiresAt: null,
    expiredAt: null,
  };
}

function inferDifficulty(domain: ReviewDomain, confidenceBand: string, queuePriority?: number) {
  if (domain === 'signals') {
    if (confidenceBand.toLowerCase().includes('low')) return 'Elevated review';
    return 'Rapid review';
  }

  if (Number(queuePriority || 0) >= 70) return 'High priority';
  if (confidenceBand.toLowerCase().includes('low')) return 'Manual review';
  return 'Standard review';
}

function inferRisk(domain: ReviewDomain, confidence?: number | null) {
  if (domain === 'signals') {
    if (confidence !== undefined && confidence !== null && Number(confidence) < 0.55) return 'Higher review risk';
    return 'Standard review risk';
  }

  return 'Controlled drawdown';
}

function buildPublishStatus(isPublished?: boolean): PublishStatus {
  return isPublished ? 'published' : 'unpublished';
}

function buildPublishStatusLabel(value: PublishStatus) {
  return value === 'published' ? 'Published' : 'Unpublished';
}

function buildLifecycleActionSupport(itemId: string | null, targetType: ReviewTargetType | null, reviewStatus: ReviewStatus, publishStatus: PublishStatus, expirationStatus: ExpirationStatus, queueId: string | null) {
  const canMutateLifecycle = Boolean(itemId && targetType && reviewStatus === 'approved');
  return {
    approveReject: Boolean(queueId) && reviewStatus === 'pending',
    publish: canMutateLifecycle && publishStatus === 'unpublished' && expirationStatus !== 'expired',
    unpublish: canMutateLifecycle && publishStatus === 'published',
    expire: canMutateLifecycle && expirationStatus !== 'expired',
  };
}

function buildOperationalNotes(targetType: ReviewTargetType | null) {
  if (targetType === 'signal') {
    return [
      'Publish, unpublish, and expire actions are executed through the internal Oracle review lifecycle endpoints.',
      'Queue approval remains the separate gate that determines whether a signal is eligible for publication.',
      'Expired signals stay visible here for internal review but are excluded from portal-safe reads.',
    ];
  }

  if (targetType === 'strategy') {
    return [
      'Strategy publication is managed separately from approval through the internal Oracle lifecycle endpoints.',
      'Approved but unpublished strategies remain visible in this dashboard for internal operators only.',
      'Expired strategies remain auditable here but are excluded from portal-safe reads.',
    ];
  }

  return [
    'This queue row is pending review and does not yet have a lifecycle-managed approved record.',
    'Approve or reject the queue item first before publication controls become available.',
  ];
}

function updateLifecycleFields(fields: Array<{ label: string; value: string }>, updates: Record<string, string>) {
  const map = new Map(fields.map((field) => [field.label, field.value]));
  for (const [label, value] of Object.entries(updates)) {
    map.set(label, value);
  }
  return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
}

function buildMetrics(items: ReviewItem[]): ReviewMetric[] {
  return [
    { label: 'Pending Review', value: items.filter((item) => item.reviewStatus === 'pending').length, tone: 'warning' },
    { label: 'Published', value: items.filter((item) => item.publishStatus === 'published').length, tone: 'success' },
    { label: 'Strategies', value: items.filter((item) => item.domain === 'strategies').length },
    { label: 'Signals', value: items.filter((item) => item.domain === 'signals').length },
  ];
}

function formatApiError(payload: Record<string, unknown>, status: number) {
  const error = text(payload.error, `Request failed (${status})`);
  const reason = String(payload.reason || '').trim();
  const details = payload.details && typeof payload.details === 'object' ? payload.details as Record<string, unknown> : null;

  if (details?.missing_fields && Array.isArray(details.missing_fields)) {
    return `${error}: ${reason || 'missing_required_fields'} (${details.missing_fields.join(', ')})`;
  }

  if (reason) return `${error}: ${reason}`;
  return error;
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required');
  return token;
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(formatApiError(payload, response.status));
  }
  return payload as T;
}

function buildStrategyApprovedItem(row: StrategyRow, queueRow?: QueueRow): ReviewItem {
  const reviewStatus = normalizeReviewStatus(row.approval_status || queueRow?.approval_status || 'approved');
  const publishStatus = buildPublishStatus(row.is_published === true);
  const expiration = deriveExpiration({ expiresAt: row.expires_at, expiredAt: row.expired_at, meta: row.meta || null });
  const confidenceBand = normalizeConfidenceBand(row.confidence_band);
  const createdAt = row.created_at || queueRow?.created_at || '';
  const updatedAt = row.updated_at || row.created_at || queueRow?.created_at || '';
  const itemId = row.id || null;
  const targetType: ReviewTargetType = 'strategy';

  return {
    id: `strategy:${text(itemId || row.strategy_id || createdAt, 'unknown')}`,
    itemId,
    targetType,
    domain: 'strategies',
    title: text(row.strategy_id || row.structure_type, 'Strategy candidate'),
    subtitle: `${text(row.asset_type, 'forex')} • ${text(row.symbol || row.underlying_symbol, 'multi-symbol')}`,
    summary: `Educational strategy record with ${fmtPct(row.win_rate)} win rate and ${fmtNum(row.profit_factor)} profit factor.`,
    reviewStatus,
    publishStatus,
    expirationStatus: expiration.status,
    confidenceLabel: confidenceBand,
    difficultyLabel: inferDifficulty('strategies', confidenceBand, queueRow?.priority),
    riskLabel: inferRisk('strategies', null),
    directionLabel: 'Rules-based strategy',
    setupTypeLabel: text(row.structure_type || row.asset_type, 'General setup'),
    symbolLabel: text(row.underlying_symbol || row.symbol, 'Multi-symbol'),
    reviewStatusLabel: buildReviewStatusLabel(reviewStatus),
    publishStatusLabel: buildPublishStatusLabel(publishStatus),
    expirationLabel: expiration.label,
    createdAtLabel: fmtDate(createdAt),
    createdAt,
    updatedAtLabel: fmtDate(updatedAt),
    updatedAt,
    queueId: queueRow?.id || null,
    notes: text(queueRow?.notes, ''),
    publishedAt: toIsoOrNull(row.published_at),
    expiresAt: expiration.expiresAt,
    expiredAt: expiration.expiredAt,
    reviewFields: [
      { label: 'Type', value: text(row.asset_type, 'forex') },
      { label: 'Summary', value: `Rank ${text(row.rank, '-')}, net PnL ${fmtNum(row.net_pnl)}` },
      { label: 'Confidence', value: confidenceBand },
      { label: 'Difficulty', value: inferDifficulty('strategies', confidenceBand, queueRow?.priority) },
      { label: 'Review Status', value: buildReviewStatusLabel(reviewStatus) },
      { label: 'Published', value: buildPublishStatusLabel(publishStatus) },
      { label: 'Expiration', value: expiration.label },
    ],
    actionSupport: buildLifecycleActionSupport(itemId, targetType, reviewStatus, publishStatus, expiration.status, queueRow?.id || null),
    operationalNotes: buildOperationalNotes(targetType),
    latestMutationMessage: null,
  };
}

function buildSignalApprovedItem(row: SignalRow, queueRow?: QueueRow): ReviewItem {
  const reviewStatus = normalizeReviewStatus(row.approval_status || queueRow?.approval_status || 'approved');
  const publishStatus = buildPublishStatus(row.is_published === true);
  const createdAt = row.created_at || queueRow?.created_at || '';
  const updatedAt = row.updated_at || row.created_at || queueRow?.created_at || '';
  const expiration = deriveExpiration({ expiresAt: row.expires_at, expiredAt: row.expired_at, meta: row.meta || null });
  const confidenceBand = normalizeConfidenceBand(row.confidence_band);
  const itemId = row.id || null;
  const targetType: ReviewTargetType = 'signal';

  return {
    id: `signal:${text(itemId || row.strategy_id || createdAt, 'unknown')}`,
    itemId,
    targetType,
    domain: 'signals',
    title: text(row.symbol, 'Signal candidate'),
    subtitle: `${text(row.side, 'directional')} • ${text(row.timeframe, 'review window')}`,
    summary: text(row.summary, 'Approved educational signal available for internal review.'),
    reviewStatus,
    publishStatus,
    expirationStatus: expiration.status,
    confidenceLabel: row.confidence !== undefined && row.confidence !== null ? fmtPct(row.confidence) : confidenceBand,
    difficultyLabel: inferDifficulty('signals', confidenceBand, queueRow?.priority),
    riskLabel: inferRisk('signals', row.confidence),
    directionLabel: text(row.side, 'Directional').toUpperCase(),
    setupTypeLabel: text(row.asset_type, 'Signal'),
    symbolLabel: text(row.symbol, 'Multi-symbol'),
    reviewStatusLabel: buildReviewStatusLabel(reviewStatus),
    publishStatusLabel: buildPublishStatusLabel(publishStatus),
    expirationLabel: expiration.label,
    createdAtLabel: fmtDate(createdAt),
    createdAt,
    updatedAtLabel: fmtDate(updatedAt),
    updatedAt,
    queueId: queueRow?.id || null,
    notes: text(queueRow?.notes, ''),
    publishedAt: toIsoOrNull(row.published_at),
    expiresAt: expiration.expiresAt,
    expiredAt: expiration.expiredAt,
    reviewFields: [
      { label: 'Symbol', value: text(row.symbol, 'Not available') },
      { label: 'Setup Type', value: text(row.asset_type, 'Signal') },
      { label: 'Direction', value: text(row.side, 'Directional').toUpperCase() },
      { label: 'Confidence', value: row.confidence !== undefined && row.confidence !== null ? fmtPct(row.confidence) : confidenceBand },
      { label: 'Risk', value: inferRisk('signals', row.confidence) },
      { label: 'Published', value: buildPublishStatusLabel(publishStatus) },
      { label: 'Expiration', value: expiration.label },
    ],
    actionSupport: buildLifecycleActionSupport(itemId, targetType, reviewStatus, publishStatus, expiration.status, queueRow?.id || null),
    operationalNotes: buildOperationalNotes(targetType),
    latestMutationMessage: null,
  };
}

function buildQueueOnlyItem(row: QueueRow, domain: ReviewDomain): ReviewItem {
  const reviewStatus = normalizeReviewStatus(row.approval_status || row.status);
  const publishStatus: PublishStatus = 'unpublished';
  const createdAt = row.created_at || '';

  return {
    id: `${domain}-queue:${text(row.id, 'unknown')}`,
    itemId: null,
    targetType: null,
    domain,
    title: domain === 'strategies' ? text(row.strategy_id, 'Strategy candidate') : text(row.symbol || row.strategy_id, 'Signal candidate'),
    subtitle: domain === 'strategies' ? text(row.symbol, 'Awaiting detail payload') : `Pending signal • ${text(row.symbol, 'No symbol')}`,
    summary: 'Queue item exists, but the approved lifecycle record has not been created yet.',
    reviewStatus,
    publishStatus,
    expirationStatus: 'active',
    confidenceLabel: 'Backend detail required',
    difficultyLabel: inferDifficulty(domain, 'under_review', row.priority),
    riskLabel: 'Backend detail required',
    directionLabel: domain === 'signals' ? 'Pending review' : 'Strategy candidate',
    setupTypeLabel: domain === 'signals' ? 'Signal candidate' : 'Strategy candidate',
    symbolLabel: text(row.symbol, 'Not available'),
    reviewStatusLabel: buildReviewStatusLabel(reviewStatus),
    publishStatusLabel: buildPublishStatusLabel(publishStatus),
    expirationLabel: 'No expiration set',
    createdAtLabel: fmtDate(createdAt),
    createdAt,
    updatedAtLabel: fmtDate(createdAt),
    updatedAt: createdAt,
    queueId: row.id || null,
    notes: text(row.notes, ''),
    publishedAt: null,
    expiresAt: null,
    expiredAt: null,
    reviewFields: [
      { label: 'Status', value: buildReviewStatusLabel(reviewStatus) },
      { label: 'Priority', value: text(row.priority, 'Not available') },
      { label: 'Requested By', value: text(row.requested_by, 'System') },
      { label: 'Published', value: buildPublishStatusLabel(publishStatus) },
      { label: 'Expiration', value: 'No expiration set' },
    ],
    actionSupport: buildLifecycleActionSupport(null, null, reviewStatus, publishStatus, 'active', row.id || null),
    operationalNotes: buildOperationalNotes(null),
    latestMutationMessage: null,
  };
}

function inferQueueDomain(row: QueueRow, signalStrategyIds: Set<string>) {
  if (row.proposal_id) return 'signals' as const;
  if (row.strategy_id && signalStrategyIds.has(row.strategy_id)) return 'signals' as const;
  return 'strategies' as const;
}

function buildLifecycleSuccessMessage(action: 'publish' | 'unpublish' | 'expire', item: ReviewItem) {
  if (action === 'publish') return `${item.title} published for approved portal visibility.`;
  if (action === 'unpublish') return `${item.title} unpublished from portal-safe reads.`;
  return `${item.title} expired and removed from portal-safe reads.`;
}

function applyLifecycleUpdate(item: ReviewItem, mutation: LifecycleMutationPayload, action: 'publish' | 'unpublish' | 'expire') {
  const reviewStatus = normalizeReviewStatus(mutation.approval_status || item.reviewStatus);
  const publishStatus = buildPublishStatus(mutation.is_published === true);
  const expiration = deriveExpiration({ expiresAt: mutation.expires_at, expiredAt: mutation.expired_at });
  const updatedAt = mutation.updated_at || mutation.created_at || item.updatedAt;

  const next: ReviewItem = {
    ...item,
    itemId: mutation.id || item.itemId,
    targetType: mutation.target_type || item.targetType,
    reviewStatus,
    publishStatus,
    expirationStatus: expiration.status,
    reviewStatusLabel: buildReviewStatusLabel(reviewStatus),
    publishStatusLabel: buildPublishStatusLabel(publishStatus),
    expirationLabel: expiration.label,
    updatedAt,
    updatedAtLabel: fmtDate(updatedAt),
    publishedAt: toIsoOrNull(mutation.published_at) || item.publishedAt,
    expiresAt: expiration.expiresAt,
    expiredAt: expiration.expiredAt,
    reviewFields: updateLifecycleFields(item.reviewFields, {
      'Review Status': buildReviewStatusLabel(reviewStatus),
      Published: buildPublishStatusLabel(publishStatus),
      Expiration: expiration.label,
    }),
    latestMutationMessage: null,
  };

  next.actionSupport = buildLifecycleActionSupport(next.itemId, next.targetType, next.reviewStatus, next.publishStatus, next.expirationStatus, next.queueId);
  next.operationalNotes = buildOperationalNotes(next.targetType);
  next.latestMutationMessage = buildLifecycleSuccessMessage(action, next);
  return next;
}

export function patchDashboardLifecycleItem(current: ReviewDashboardData, input: { item: ReviewItem; mutation: LifecycleMutationResponse }) {
  if (!input.mutation.item || !input.mutation.action) return current;

  const items = current.items.map((entry) => {
    if (entry.id !== input.item.id) return entry;
    return applyLifecycleUpdate(entry, input.mutation.item || {}, input.mutation.action);
  });

  return {
    ...current,
    items,
    metrics: buildMetrics(items),
  };
}

export async function fetchReviewDashboard(tenantId: string): Promise<ReviewDashboardData> {
  const token = await accessToken();
  const params = new URLSearchParams({ tenant_id: tenantId, limit: '50' });
  const payload = await requestJson<DashboardPayload>(`/.netlify/functions/admin-research-approvals?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const strategies = Array.isArray(payload.strategies) ? payload.strategies : [];
  const options = Array.isArray(payload.options) ? payload.options : [];
  const signals = Array.isArray(payload.signals) ? payload.signals : [];
  const queue = Array.isArray(payload.queue) ? payload.queue : [];

  const signalStrategyIds = new Set(signals.map((item) => String(item.strategy_id || '')).filter(Boolean));
  const queueByStrategyId = new Map<string, QueueRow>();
  const queueByProposalId = new Map<string, QueueRow>();
  const queueOnlyItems: ReviewItem[] = [];

  for (const row of queue) {
    if (row.strategy_id) queueByStrategyId.set(String(row.strategy_id), row);
    if (row.proposal_id) queueByProposalId.set(String(row.proposal_id), row);
  }

  const strategyItems = [...strategies, ...options].map((row) => buildStrategyApprovedItem(row, row.strategy_id ? queueByStrategyId.get(String(row.strategy_id)) : undefined));
  const signalItems = signals.map((row) => buildSignalApprovedItem(row, row.id ? queueByProposalId.get(String(row.id)) : undefined));

  const existingKeys = new Set([...strategyItems, ...signalItems].map((item) => item.queueId).filter(Boolean));
  for (const row of queue) {
    if (row.id && existingKeys.has(row.id)) continue;
    queueOnlyItems.push(buildQueueOnlyItem(row, inferQueueDomain(row, signalStrategyIds)));
  }

  const items = [...queueOnlyItems, ...strategyItems, ...signalItems].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));

  return {
    tenantId: payload.tenant_id || tenantId,
    metrics: buildMetrics(items),
    items,
  };
}

export async function approveOrRejectReviewItem(input: {
  tenantId: string;
  queueId: string;
  decision: 'approved' | 'rejected';
  notes?: string;
}) {
  const token = await accessToken();
  return requestJson(`/.netlify/functions/admin-research-queue-decide`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tenant_id: input.tenantId,
      queue_id: input.queueId,
      decision: input.decision,
      notes: input.notes || undefined,
    }),
  });
}

async function mutateReviewLifecycle(input: {
  tenantId: string;
  itemId: string;
  targetType: ReviewTargetType;
  action: 'publish' | 'unpublish' | 'expire';
  notes?: string;
}) {
  const token = await accessToken();
  return requestJson<LifecycleMutationResponse>(`/.netlify/functions/admin-review-item-lifecycle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tenant_id: input.tenantId,
      item_id: input.itemId,
      target_type: input.targetType,
      action: input.action,
      notes: input.notes || undefined,
    }),
  });
}

export async function publishReviewItem(input: { tenantId: string; itemId: string; targetType: ReviewTargetType; notes?: string }) {
  return mutateReviewLifecycle({ ...input, action: 'publish' });
}

export async function unpublishReviewItem(input: { tenantId: string; itemId: string; targetType: ReviewTargetType; notes?: string }) {
  return mutateReviewLifecycle({ ...input, action: 'unpublish' });
}

export async function expireReviewItem(input: { tenantId: string; itemId: string; targetType: ReviewTargetType; notes?: string }) {
  return mutateReviewLifecycle({ ...input, action: 'expire' });
}
