import React, { useEffect, useMemo, useState } from 'react';
import ReviewDetailPanel from '../components/adminReview/ReviewDetailPanel';
import ReviewFilters, { ReviewPageFilters } from '../components/adminReview/ReviewFilters';
import ReviewItemList from '../components/adminReview/ReviewItemList';
import { useReviewQueue } from '../hooks/useReviewQueue';
import { ReviewItem } from '../services/adminReviewService';
import { FreshnessAttentionScope, matchesAttentionScope } from '../services/reviewAnalyticsService';

const INITIAL_FILTERS: ReviewPageFilters = {
  domain: 'all',
  reviewStatus: 'pending',
  publishStatus: 'all',
  expirationStatus: 'all',
  search: '',
};

const ATTENTION_LABELS: Record<Exclude<FreshnessAttentionScope, 'all'>, string> = {
  stale: 'Stale content',
  expired: 'Expired content',
  expiring_soon: 'Expiring soon',
  approved_unpublished: 'Approved but unpublished',
  old_approved: 'Old approved content',
  long_pending: 'Long-pending review items',
};

function isReviewDomain(value: string): value is ReviewPageFilters['domain'] {
  return ['all', 'strategies', 'signals'].includes(value);
}

function isReviewStatus(value: string): value is ReviewPageFilters['reviewStatus'] {
  return ['all', 'pending', 'approved', 'rejected'].includes(value);
}

function isPublishStatus(value: string): value is ReviewPageFilters['publishStatus'] {
  return ['all', 'published', 'unpublished'].includes(value);
}

function isExpirationStatus(value: string): value is ReviewPageFilters['expirationStatus'] {
  return ['all', 'active', 'expired'].includes(value);
}

function isAttentionScope(value: string): value is FreshnessAttentionScope {
  return ['all', 'stale', 'expired', 'expiring_soon', 'approved_unpublished', 'old_approved', 'long_pending'].includes(value);
}

function readInitialStateFromQuery() {
  if (typeof window === 'undefined') {
    return { filters: INITIAL_FILTERS, attention: 'all' as FreshnessAttentionScope };
  }

  const params = new URLSearchParams(window.location.search || '');
  const nextFilters: ReviewPageFilters = {
    domain: isReviewDomain(String(params.get('domain') || '')) ? (String(params.get('domain')) as ReviewPageFilters['domain']) : INITIAL_FILTERS.domain,
    reviewStatus: isReviewStatus(String(params.get('reviewStatus') || '')) ? (String(params.get('reviewStatus')) as ReviewPageFilters['reviewStatus']) : INITIAL_FILTERS.reviewStatus,
    publishStatus: isPublishStatus(String(params.get('publishStatus') || '')) ? (String(params.get('publishStatus')) as ReviewPageFilters['publishStatus']) : INITIAL_FILTERS.publishStatus,
    expirationStatus: isExpirationStatus(String(params.get('expirationStatus') || '')) ? (String(params.get('expirationStatus')) as ReviewPageFilters['expirationStatus']) : INITIAL_FILTERS.expirationStatus,
    search: String(params.get('search') || INITIAL_FILTERS.search),
  };

  const attention = String(params.get('attention') || 'all');
  return {
    filters: nextFilters,
    attention: isAttentionScope(attention) ? attention : 'all',
  };
}

function normalizeSearch(item: ReviewItem) {
  return [item.title, item.subtitle, item.summary, item.symbolLabel, item.directionLabel, item.setupTypeLabel].join(' ').toLowerCase();
}

export default function AdminResearchApprovalsPage() {
  const initialQueryState = readInitialStateFromQuery();
  const {
    user,
    checkingAccess,
    isAuthorized,
    loading,
    refreshing,
    error,
    success,
    actionBusyId,
    pendingAction,
    tenants,
    tenantId,
    setTenantId,
    dashboard,
    refresh,
    decide,
    publish,
    unpublish,
    expire,
  } = useReviewQueue();

  const [filters, setFilters] = useState<ReviewPageFilters>(initialQueryState.filters);
  const [attentionScope, setAttentionScope] = useState<FreshnessAttentionScope>(initialQueryState.attention);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});

  const filteredItems = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return dashboard.items.filter((item) => {
      if (filters.domain !== 'all' && item.domain !== filters.domain) return false;
      if (filters.reviewStatus !== 'all' && item.reviewStatus !== filters.reviewStatus) return false;
      if (filters.publishStatus !== 'all' && item.publishStatus !== filters.publishStatus) return false;
      if (filters.expirationStatus !== 'all' && item.expirationStatus !== filters.expirationStatus) return false;
      if (attentionScope !== 'all' && !matchesAttentionScope(item, attentionScope)) return false;
      if (query && !normalizeSearch(item).includes(query)) return false;
      return true;
    });
  }, [attentionScope, dashboard.items, filters]);

  useEffect(() => {
    if (!filteredItems.length) {
      setSelectedItemId(null);
      return;
    }

    setSelectedItemId((current) => {
      if (current && filteredItems.some((item) => item.id === current)) return current;
      return filteredItems[0].id;
    });
  }, [filteredItems]);

  const selectedItem = useMemo(() => {
    if (!filteredItems.length) return null;
    if (!selectedItemId) return filteredItems[0];
    return filteredItems.find((item) => item.id === selectedItemId) || filteredItems[0];
  }, [filteredItems, selectedItemId]);

  function clearScopedView() {
    setFilters(INITIAL_FILTERS);
    setAttentionScope('all');
    window.history.replaceState({}, '', '/admin/content-review');
  }

  const currentNotes = selectedItem ? (notesDrafts[selectedItem.id] ?? selectedItem.notes ?? '') : '';
  const selectedItemBusy = Boolean(selectedItem && (actionBusyId === selectedItem.id || actionBusyId === selectedItem.queueId));

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying internal review access...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal review access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal reviewers. Client-facing users do not have access to strategy and signal review controls.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Internal Review Control</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Content Review Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">Internal-only review surface for educational strategies and signals. Approval, publication, unpublication, and expiration actions are now backed by the internal lifecycle endpoints.</p>
      </div>

      {attentionScope !== 'all' ? (
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-700">Scoped From Review Analytics</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Showing {ATTENTION_LABELS[attentionScope]}</h2>
            <p className="mt-1 text-sm text-slate-600">This filtered view came from the internal analytics dashboard drill-in. Clear the scope to return to the default review queue.</p>
          </div>
          <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white" onClick={clearScopedView}>
            Clear Scope
          </button>
        </div>
      ) : null}

      <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Tenant</label>
          <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900" value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 flex items-end">
          <button type="button" className="w-full rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing || !tenantId}>
            {refreshing ? 'Refreshing...' : 'Refresh Review Queue'}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {dashboard.metrics.map((metric) => (
          <div key={metric.label} className={`rounded-[1.75rem] border p-5 shadow-sm ${metric.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : metric.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-900'}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{metric.label}</p>
            <p className="mt-2 text-3xl font-black tracking-tight">{metric.value}</p>
          </div>
        ))}
      </div>

      <ReviewFilters filters={filters} onChange={setFilters} />

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1.2fr] gap-4">
        <ReviewItemList
          items={filteredItems}
          selectedItemId={selectedItem?.id || null}
          onSelect={(item) => setSelectedItemId(item.id)}
          loading={loading}
          actionBusyId={actionBusyId}
          pendingAction={pendingAction}
          onApprove={(item) => {
            if (!item.queueId) return;
            const notes = notesDrafts[item.id] ?? item.notes ?? '';
            void decide(item.queueId, 'approved', notes);
          }}
          onReject={(item) => {
            if (!item.queueId) return;
            const notes = notesDrafts[item.id] ?? item.notes ?? '';
            void decide(item.queueId, 'rejected', notes);
          }}
          onPublish={(item) => {
            const notes = notesDrafts[item.id] ?? item.notes ?? '';
            void publish(item, notes);
          }}
          onUnpublish={(item) => {
            const notes = notesDrafts[item.id] ?? item.notes ?? '';
            void unpublish(item, notes);
          }}
          onExpire={(item) => {
            const notes = notesDrafts[item.id] ?? item.notes ?? '';
            void expire(item, notes);
          }}
        />
        <ReviewDetailPanel
          item={selectedItem}
          notes={currentNotes}
          busy={selectedItemBusy}
          pendingAction={pendingAction}
          onNotesChange={(value) => {
            if (!selectedItem) return;
            setNotesDrafts((current) => ({ ...current, [selectedItem.id]: value }));
          }}
          onApprove={() => {
            if (!selectedItem?.queueId) return;
            void decide(selectedItem.queueId, 'approved', currentNotes);
          }}
          onReject={() => {
            if (!selectedItem?.queueId) return;
            void decide(selectedItem.queueId, 'rejected', currentNotes);
          }}
          onPublish={() => {
            if (!selectedItem) return;
            void publish(selectedItem, currentNotes);
          }}
          onUnpublish={() => {
            if (!selectedItem) return;
            void unpublish(selectedItem, currentNotes);
          }}
          onExpire={() => {
            if (!selectedItem) return;
            void expire(selectedItem, currentNotes);
          }}
        />
      </div>
    </div>
  );
}