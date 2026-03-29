import type { DealEscalationItem } from '../hooks/useExecutiveMetrics';

type RiskSignal = {
  key: 'credit' | 'grant' | 'funding' | 'review' | 'engagement' | 'capital' | 'general';
  label: string;
  toneClass: string;
};

function scopedPath(path: string, params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const nextQuery = query.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

function reasonText(item: DealEscalationItem) {
  return item.why_at_risk.join(' ').toLowerCase();
}

export function getPrimaryRiskSignal(item: DealEscalationItem): RiskSignal {
  const reasons = reasonText(item);

  if (reasons.includes('credit')) {
    return {
      key: 'credit',
      label: 'Primary blocker: Credit readiness',
      toneClass: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (reasons.includes('grant')) {
    return {
      key: 'grant',
      label: 'Primary blocker: Grant execution',
      toneClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  if (reasons.includes('funding') || reasons.includes('lender')) {
    return {
      key: 'funding',
      label: 'Primary blocker: Funding motion',
      toneClass: 'border-sky-200 bg-sky-50 text-sky-700',
    };
  }

  if (reasons.includes('review')) {
    return {
      key: 'review',
      label: 'Primary blocker: Review queue',
      toneClass: 'border-violet-200 bg-violet-50 text-violet-700',
    };
  }

  if (reasons.includes('ignored') || reasons.includes('conversation') || reasons.includes('client action')) {
    return {
      key: 'engagement',
      label: 'Primary blocker: Client engagement',
      toneClass: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }

  if (reasons.includes('capital') || reasons.includes('reserve')) {
    return {
      key: 'capital',
      label: 'Primary blocker: Capital discipline',
      toneClass: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    };
  }

  return {
    key: 'general',
    label: 'Primary blocker: Multi-factor drift',
    toneClass: 'border-slate-200 bg-slate-100 text-slate-700',
  };
}

export function goToHash(hash: string, path?: string) {
  if (path) {
    window.history.pushState({}, '', path);
  }
  window.location.hash = hash;
}

export function buildDocumentsDrillthroughPath(item: DealEscalationItem) {
  const reasons = reasonText(item);
  let category = 'all';

  if (reasons.includes('credit')) category = 'credit';
  else if (reasons.includes('grant')) category = 'grants';
  else if (reasons.includes('funding') || reasons.includes('lender')) category = 'funding';

  return scopedPath('/admin/documents', {
    tenant_id: item.tenant_id,
    category: category === 'all' ? null : category,
  });
}

export function buildFundingDrillthroughPath(item: DealEscalationItem) {
  const reasons = reasonText(item);
  const status = item.approved_outcome_cents > 0
    ? 'estimated'
    : reasons.includes('funding result') || reasons.includes('lender')
      ? 'estimated'
      : null;

  return scopedPath('/admin/commissions', {
    tenant_id: item.tenant_id,
    status,
  });
}

export function buildReviewQueueDrillthroughPath(item: DealEscalationItem) {
  const reasons = reasonText(item);
  const attention = reasons.includes('ignored') || reasons.includes('review') ? 'long_pending' : null;

  return scopedPath('/admin/content-review', {
    tenant_id: item.tenant_id,
    attention,
  });
}