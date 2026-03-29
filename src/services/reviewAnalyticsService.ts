import { ReviewDashboardData, ReviewDomain, ReviewItem } from './adminReviewService';

export type FreshnessAttentionScope = 'all' | 'stale' | 'expired' | 'expiring_soon' | 'approved_unpublished' | 'old_approved' | 'long_pending';

export type ReviewDashboardQuery = Partial<{
  domain: 'all' | ReviewDomain;
  reviewStatus: 'all' | 'pending' | 'approved' | 'rejected';
  publishStatus: 'all' | 'published' | 'unpublished';
  expirationStatus: 'all' | 'active' | 'expired';
  search: string;
  attention: FreshnessAttentionScope;
}>;

type AnalyticsTone = 'default' | 'success' | 'warning' | 'danger';

export type AnalyticsMetric = {
  id: string;
  label: string;
  helper: string;
  value: number;
  tone: AnalyticsTone;
  query: ReviewDashboardQuery;
};

export type QueueHealthRow = {
  id: string;
  label: string;
  helper: string;
  value: number;
  tone: AnalyticsTone;
  query: ReviewDashboardQuery;
};

export type FreshnessBucket = {
  id: Exclude<FreshnessAttentionScope, 'all' | 'stale'>;
  label: string;
  helper: string;
  value: number;
  tone: AnalyticsTone;
  query: ReviewDashboardQuery;
};

export type PriorityAttentionItem = {
  id: string;
  title: string;
  subtitle: string;
  reason: string;
  ageLabel: string;
  tone: AnalyticsTone;
  query: ReviewDashboardQuery;
};

export type ReviewAnalyticsSnapshot = {
  headlineMetrics: AnalyticsMetric[];
  queueHealth: QueueHealthRow[];
  freshness: FreshnessBucket[];
  priorityItems: PriorityAttentionItem[];
  staleCount: number;
  backlogLeader: string;
  lastUpdatedLabel: string;
  trendPlaceholder: string;
};

const LONG_PENDING_HOURS = 72;
const STALE_APPROVED_DAYS = 14;
const EXPIRING_SOON_HOURS = 72;

function parseTime(value?: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function ageHours(value?: string | null) {
  const timestamp = parseTime(value);
  if (timestamp === null) return 0;
  return Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60));
}

function hoursUntil(value?: string | null) {
  const timestamp = parseTime(value);
  if (timestamp === null) return Number.POSITIVE_INFINITY;
  return (timestamp - Date.now()) / (1000 * 60 * 60);
}

function formatRelativeAge(hours: number) {
  if (hours < 24) return `${Math.max(1, Math.round(hours))}h old`;
  const days = hours / 24;
  if (days < 14) return `${Math.max(1, Math.round(days))}d old`;
  return `${days.toFixed(1)}d old`;
}

function toneForCount(value: number, successTone: AnalyticsTone = 'success'): AnalyticsTone {
  if (value <= 0) return 'default';
  return successTone;
}

function buildSearchToken(item: ReviewItem) {
  const symbol = String(item.symbolLabel || '').trim();
  if (symbol && symbol.toLowerCase() !== 'multi-symbol' && symbol.toLowerCase() !== 'not available') return symbol;
  return item.title;
}

export function isExpiredItem(item: ReviewItem) {
  return item.expirationStatus === 'expired';
}

export function isExpiringSoonItem(item: ReviewItem) {
  const hours = hoursUntil(item.expiresAt);
  return item.expirationStatus !== 'expired' && Number.isFinite(hours) && hours > 0 && hours <= EXPIRING_SOON_HOURS;
}

export function isApprovedUnpublishedItem(item: ReviewItem) {
  return item.reviewStatus === 'approved' && item.publishStatus === 'unpublished' && item.expirationStatus !== 'expired';
}

export function isOldApprovedItem(item: ReviewItem) {
  return item.reviewStatus === 'approved' && item.expirationStatus !== 'expired' && ageHours(item.updatedAt) >= STALE_APPROVED_DAYS * 24;
}

export function isLongPendingItem(item: ReviewItem) {
  return item.reviewStatus === 'pending' && ageHours(item.createdAt || item.updatedAt) >= LONG_PENDING_HOURS;
}

export function matchesAttentionScope(item: ReviewItem, scope: FreshnessAttentionScope) {
  if (scope === 'all') return true;
  if (scope === 'expired') return isExpiredItem(item);
  if (scope === 'expiring_soon') return isExpiringSoonItem(item);
  if (scope === 'approved_unpublished') return isApprovedUnpublishedItem(item);
  if (scope === 'old_approved') return isOldApprovedItem(item);
  if (scope === 'long_pending') return isLongPendingItem(item);
  return [
    isExpiredItem(item),
    isExpiringSoonItem(item),
    isApprovedUnpublishedItem(item),
    isOldApprovedItem(item),
    isLongPendingItem(item),
  ].some(Boolean);
}

export function buildReviewDashboardPath(query: ReviewDashboardQuery = {}) {
  const params = new URLSearchParams();
  if (query.domain && query.domain !== 'all') params.set('domain', query.domain);
  if (query.reviewStatus && query.reviewStatus !== 'all') params.set('reviewStatus', query.reviewStatus);
  if (query.publishStatus && query.publishStatus !== 'all') params.set('publishStatus', query.publishStatus);
  if (query.expirationStatus && query.expirationStatus !== 'all') params.set('expirationStatus', query.expirationStatus);
  if (query.search && String(query.search).trim()) params.set('search', String(query.search).trim());
  if (query.attention && query.attention !== 'all') params.set('attention', query.attention);
  const search = params.toString();
  return `/admin/content-review${search ? `?${search}` : ''}`;
}

export function buildFreshnessBuckets(items: ReviewItem[]): FreshnessBucket[] {
  const expired = items.filter(isExpiredItem).length;
  const expiringSoon = items.filter(isExpiringSoonItem).length;
  const approvedUnpublished = items.filter(isApprovedUnpublishedItem).length;
  const oldApproved = items.filter(isOldApprovedItem).length;
  const longPending = items.filter(isLongPendingItem).length;

  return [
    {
      id: 'expired',
      label: 'Expired Already',
      helper: 'Lifecycle-expired items still visible internally but hidden from portal-safe reads.',
      value: expired,
      tone: toneForCount(expired, 'danger'),
      query: { expirationStatus: 'expired', attention: 'expired' },
    },
    {
      id: 'expiring_soon',
      label: 'Expiring Soon',
      helper: `Items due within ${EXPIRING_SOON_HOURS} hours that should be reviewed before they age out.`,
      value: expiringSoon,
      tone: toneForCount(expiringSoon, 'warning'),
      query: { attention: 'expiring_soon' },
    },
    {
      id: 'approved_unpublished',
      label: 'Approved, Unpublished',
      helper: 'Approved content waiting on an explicit publish decision.',
      value: approvedUnpublished,
      tone: toneForCount(approvedUnpublished, 'warning'),
      query: { reviewStatus: 'approved', publishStatus: 'unpublished', attention: 'approved_unpublished' },
    },
    {
      id: 'old_approved',
      label: 'Old Approved Content',
      helper: `Approved items older than ${STALE_APPROVED_DAYS} days since the last lifecycle update.`,
      value: oldApproved,
      tone: toneForCount(oldApproved, 'warning'),
      query: { reviewStatus: 'approved', attention: 'old_approved' },
    },
    {
      id: 'long_pending',
      label: 'Long-Pending Review',
      helper: `Pending items older than ${LONG_PENDING_HOURS} hours that are building queue risk.`,
      value: longPending,
      tone: toneForCount(longPending, 'danger'),
      query: { reviewStatus: 'pending', attention: 'long_pending' },
    },
  ];
}

function buildPriorityAttentionItems(items: ReviewItem[]): PriorityAttentionItem[] {
  const entries = items
    .map((item) => {
      const reasons: Array<{ score: number; tone: AnalyticsTone; reason: string; attention: FreshnessAttentionScope; ageSource: string }> = [];

      if (isExpiredItem(item)) {
        reasons.push({ score: 100, tone: 'danger', reason: 'Expired content should be confirmed for replacement or archival.', attention: 'expired', ageSource: item.expiresAt || item.updatedAt });
      }
      if (isLongPendingItem(item)) {
        reasons.push({ score: 90, tone: 'danger', reason: 'Pending review is aging past the operational threshold.', attention: 'long_pending', ageSource: item.createdAt || item.updatedAt });
      }
      if (isExpiringSoonItem(item)) {
        reasons.push({ score: 80, tone: 'warning', reason: 'Expiration window is approaching within the next review cycle.', attention: 'expiring_soon', ageSource: item.expiresAt || item.updatedAt });
      }
      if (isApprovedUnpublishedItem(item)) {
        reasons.push({ score: 70, tone: 'warning', reason: 'Approved content is waiting on an explicit publish decision.', attention: 'approved_unpublished', ageSource: item.updatedAt });
      }
      if (isOldApprovedItem(item)) {
        reasons.push({ score: 60, tone: 'warning', reason: 'Approved content is stale and should be refreshed.', attention: 'old_approved', ageSource: item.updatedAt });
      }

      if (!reasons.length) return null;
      const primary = reasons.sort((left, right) => right.score - left.score)[0];
      return {
        score: primary.score,
        item: {
          id: `${item.id}:${primary.attention}`,
          title: item.title,
          subtitle: `${item.domain === 'strategies' ? 'Strategy' : 'Signal'} • ${item.symbolLabel}`,
          reason: primary.reason,
          ageLabel: formatRelativeAge(ageHours(primary.ageSource)),
          tone: primary.tone,
          query: {
            domain: item.domain,
            search: buildSearchToken(item),
            attention: primary.attention,
          },
        },
      };
    })
    .filter(Boolean) as Array<{ score: number; item: PriorityAttentionItem }>;

  return entries.sort((left, right) => right.score - left.score).slice(0, 6).map((entry) => entry.item);
}

export function buildReviewAnalyticsSnapshot(dashboard: ReviewDashboardData, freshnessBuckets = buildFreshnessBuckets(dashboard.items)): ReviewAnalyticsSnapshot {
  const items = dashboard.items;
  const pendingStrategies = items.filter((item) => item.domain === 'strategies' && item.reviewStatus === 'pending').length;
  const pendingSignals = items.filter((item) => item.domain === 'signals' && item.reviewStatus === 'pending').length;
  const approvedStrategies = items.filter((item) => item.domain === 'strategies' && item.reviewStatus === 'approved').length;
  const approvedSignals = items.filter((item) => item.domain === 'signals' && item.reviewStatus === 'approved').length;
  const publishedStrategies = items.filter((item) => item.domain === 'strategies' && item.publishStatus === 'published').length;
  const publishedSignals = items.filter((item) => item.domain === 'signals' && item.publishStatus === 'published').length;
  const rejectedItems = items.filter((item) => item.reviewStatus === 'rejected').length;
  const expiredItems = items.filter(isExpiredItem).length;
  const staleCount = items.filter((item) => matchesAttentionScope(item, 'stale')).length;
  const approvedUnpublished = items.filter(isApprovedUnpublishedItem).length;
  const longPending = items.filter(isLongPendingItem).length;
  const backlogLeader = pendingStrategies === pendingSignals ? 'Balanced backlog' : pendingStrategies > pendingSignals ? 'Strategies are leading backlog' : 'Signals are leading backlog';
  const latestUpdate = items.map((item) => parseTime(item.updatedAt)).filter((value): value is number => value !== null).sort((left, right) => right - left)[0];

  return {
    headlineMetrics: [
      { id: 'pending-strategies', label: 'Pending Strategies', helper: 'Strategy candidates still waiting on reviewer decisions.', value: pendingStrategies, tone: toneForCount(pendingStrategies, 'warning'), query: { domain: 'strategies', reviewStatus: 'pending' } },
      { id: 'pending-signals', label: 'Pending Signals', helper: 'Signal proposals waiting in the current review queue.', value: pendingSignals, tone: toneForCount(pendingSignals, 'warning'), query: { domain: 'signals', reviewStatus: 'pending' } },
      { id: 'approved-strategies', label: 'Approved Strategies', helper: 'Approved strategy records visible to internal operators.', value: approvedStrategies, tone: toneForCount(approvedStrategies, 'success'), query: { domain: 'strategies', reviewStatus: 'approved' } },
      { id: 'approved-signals', label: 'Approved Signals', helper: 'Approved signal records available for lifecycle decisions.', value: approvedSignals, tone: toneForCount(approvedSignals, 'success'), query: { domain: 'signals', reviewStatus: 'approved' } },
      { id: 'published-strategies', label: 'Published Strategies', helper: 'Strategies currently eligible for portal-safe reads.', value: publishedStrategies, tone: toneForCount(publishedStrategies, 'success'), query: { domain: 'strategies', publishStatus: 'published' } },
      { id: 'published-signals', label: 'Published Signals', helper: 'Signals currently visible to downstream portal-safe consumers.', value: publishedSignals, tone: toneForCount(publishedSignals, 'success'), query: { domain: 'signals', publishStatus: 'published' } },
      { id: 'rejected-items', label: 'Rejected Items', helper: 'Rejected review items kept for internal audit visibility.', value: rejectedItems, tone: toneForCount(rejectedItems, 'default'), query: { reviewStatus: 'rejected' } },
      { id: 'expired-items', label: 'Expired Items', helper: 'Expired content that now requires refresh or replacement.', value: expiredItems, tone: toneForCount(expiredItems, 'danger'), query: { expirationStatus: 'expired', attention: 'expired' } },
      { id: 'stale-items', label: 'Stale Items', helper: 'Expired, expiring soon, approved-unpublished, old-approved, or long-pending content.', value: staleCount, tone: toneForCount(staleCount, 'warning'), query: { attention: 'stale' } },
    ],
    queueHealth: [
      { id: 'backlog-strategies', label: 'Strategy backlog', helper: 'Pending strategy items waiting for review decisions.', value: pendingStrategies, tone: toneForCount(pendingStrategies, 'warning'), query: { domain: 'strategies', reviewStatus: 'pending' } },
      { id: 'backlog-signals', label: 'Signal backlog', helper: 'Pending signal items waiting for review decisions.', value: pendingSignals, tone: toneForCount(pendingSignals, 'warning'), query: { domain: 'signals', reviewStatus: 'pending' } },
      { id: 'approved-unpublished', label: 'Approved, unpublished', helper: 'Review is done, but lifecycle publication is still outstanding.', value: approvedUnpublished, tone: toneForCount(approvedUnpublished, 'warning'), query: { reviewStatus: 'approved', publishStatus: 'unpublished', attention: 'approved_unpublished' } },
      { id: 'long-pending', label: 'Long-pending review', helper: 'Items crossing the age threshold for review attention.', value: longPending, tone: toneForCount(longPending, 'danger'), query: { reviewStatus: 'pending', attention: 'long_pending' } },
      { id: 'expired', label: 'Expired content', helper: 'Items already past expiration and needing next-step handling.', value: expiredItems, tone: toneForCount(expiredItems, 'danger'), query: { expirationStatus: 'expired', attention: 'expired' } },
      { id: 'stale-total', label: 'Total stale pressure', helper: 'Combined freshness pressure across the review pipeline.', value: staleCount, tone: toneForCount(staleCount, 'warning'), query: { attention: 'stale' } },
    ],
    freshness: freshnessBuckets,
    priorityItems: buildPriorityAttentionItems(items),
    staleCount,
    backlogLeader,
    lastUpdatedLabel: latestUpdate ? new Date(latestUpdate).toLocaleString() : 'No review data loaded yet',
    trendPlaceholder: 'Historical review trends are not exposed by the current internal API yet. This dashboard is intentionally using live snapshot counts from the review payload.',
  };
}