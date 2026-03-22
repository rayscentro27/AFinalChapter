import React from 'react';
import { ReviewAction, ReviewItem } from '../../services/adminReviewService';

type Props = {
  item: ReviewItem;
  notes: string;
  busy: boolean;
  pendingAction: ReviewAction | null;
  onNotesChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onExpire: () => void;
};

function buttonLabel(action: ReviewAction, busy: boolean, pendingAction: ReviewAction | null, idle: string) {
  if (!busy || pendingAction !== action) return idle;
  if (action === 'approve') return 'Approving...';
  if (action === 'reject') return 'Rejecting...';
  if (action === 'publish') return 'Publishing...';
  if (action === 'unpublish') return 'Unpublishing...';
  return 'Expiring...';
}

export default function ReviewActionsBar({ item, notes, busy, pendingAction, onNotesChange, onApprove, onReject, onPublish, onUnpublish, onExpire }: Props) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4 space-y-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reviewer Notes</p>
        <textarea
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Add an internal review note"
          className="mt-2 min-h-[5rem] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          disabled={busy}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-emerald-700 disabled:opacity-50" onClick={onApprove} disabled={busy || !item.actionSupport.approveReject}>
          {buttonLabel('approve', busy, pendingAction, 'Approve')}
        </button>
        <button type="button" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-rose-700 disabled:opacity-50" onClick={onReject} disabled={busy || !item.actionSupport.approveReject}>
          {buttonLabel('reject', busy, pendingAction, 'Reject')}
        </button>
        <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50" onClick={onPublish} disabled={busy || !item.actionSupport.publish}>
          {buttonLabel('publish', busy, pendingAction, 'Publish')}
        </button>
        <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50" onClick={onUnpublish} disabled={busy || !item.actionSupport.unpublish}>
          {buttonLabel('unpublish', busy, pendingAction, 'Unpublish')}
        </button>
        <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50" onClick={onExpire} disabled={busy || !item.actionSupport.expire}>
          {buttonLabel('expire', busy, pendingAction, 'Expire')}
        </button>
      </div>

      {item.latestMutationMessage ? <p className="text-xs text-emerald-700">{item.latestMutationMessage}</p> : null}
      <p className="text-xs text-slate-500">Lifecycle actions are internal-only and only affect approved content that has a lifecycle-managed review record.</p>
    </div>
  );
}
