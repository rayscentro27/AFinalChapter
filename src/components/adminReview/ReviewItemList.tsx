import React from 'react';
import { ReviewAction, ReviewItem } from '../../services/adminReviewService';

type Props = {
  items: ReviewItem[];
  selectedItemId: string | null;
  onSelect: (item: ReviewItem) => void;
  loading: boolean;
  actionBusyId: string;
  pendingAction: ReviewAction | null;
  onApprove: (item: ReviewItem) => void;
  onReject: (item: ReviewItem) => void;
  onPublish: (item: ReviewItem) => void;
  onUnpublish: (item: ReviewItem) => void;
  onExpire: (item: ReviewItem) => void;
};

function statusTone(item: ReviewItem) {
  if (item.reviewStatus === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (item.reviewStatus === 'rejected') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function isItemBusy(item: ReviewItem, actionBusyId: string) {
  return actionBusyId === item.id || actionBusyId === item.queueId;
}

function actionLabel(action: ReviewAction, busy: boolean, pendingAction: ReviewAction | null, idle: string) {
  if (!busy || pendingAction !== action) return idle;
  if (action === 'approve') return 'Approving...';
  if (action === 'reject') return 'Rejecting...';
  if (action === 'publish') return 'Publishing...';
  if (action === 'unpublish') return 'Unpublishing...';
  return 'Expiring...';
}

export default function ReviewItemList({ items, selectedItemId, onSelect, loading, actionBusyId, pendingAction, onApprove, onReject, onPublish, onUnpublish, onExpire }: Props) {
  if (loading) {
    return <div className="rounded-[2rem] border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Loading review queue...</div>;
  }

  if (items.length === 0) {
    return <div className="rounded-[2rem] border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">No review items matched the current filters.</div>;
  }

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-3 shadow-sm">
      <div className="space-y-2">
        {items.map((item) => {
          const active = item.id === selectedItemId;
          const busy = isItemBusy(item, actionBusyId);
          return (
            <div
              key={item.id}
              onClick={() => onSelect(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(item);
                }
              }}
              role="button"
              tabIndex={0}
              className={`w-full rounded-[1.5rem] border p-4 text-left transition ${active ? 'border-slate-900 bg-slate-900 text-white shadow-[0_14px_40px_rgba(15,23,42,0.12)]' : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-slate-300' : 'text-slate-400'}`}>{item.domain}</p>
                  <p className={`mt-2 text-sm font-black ${active ? 'text-white' : 'text-slate-900'}`}>{item.title}</p>
                  <p className={`mt-1 text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>{item.subtitle}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${active ? 'border-white/20 bg-white/10 text-white' : statusTone(item)}`}>
                  {item.reviewStatusLabel}
                </span>
              </div>
              <p className={`mt-3 text-xs leading-relaxed ${active ? 'text-slate-200' : 'text-slate-600'}`}>{item.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
                <span className={`rounded-full border px-2 py-1 ${active ? 'border-white/20 text-slate-200' : 'border-slate-200 text-slate-500'}`}>{item.publishStatusLabel}</span>
                <span className={`rounded-full border px-2 py-1 ${active ? 'border-white/20 text-slate-200' : 'border-slate-200 text-slate-500'}`}>{item.expirationLabel}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 disabled:opacity-50" onClick={() => onApprove(item)} disabled={busy || !item.actionSupport.approveReject}>
                  {actionLabel('approve', busy, pendingAction, 'Approve')}
                </button>
                <button type="button" className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-rose-700 disabled:opacity-50" onClick={() => onReject(item)} disabled={busy || !item.actionSupport.approveReject}>
                  {actionLabel('reject', busy, pendingAction, 'Reject')}
                </button>
                <button type="button" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50" onClick={() => onPublish(item)} disabled={busy || !item.actionSupport.publish}>
                  {actionLabel('publish', busy, pendingAction, 'Publish')}
                </button>
                <button type="button" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50" onClick={() => onUnpublish(item)} disabled={busy || !item.actionSupport.unpublish}>
                  {actionLabel('unpublish', busy, pendingAction, 'Unpublish')}
                </button>
                <button type="button" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50" onClick={() => onExpire(item)} disabled={busy || !item.actionSupport.expire}>
                  {actionLabel('expire', busy, pendingAction, 'Expire')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
