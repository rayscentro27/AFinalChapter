import React from 'react';
import { ReviewAction, ReviewItem } from '../../services/adminReviewService';
import ReviewActionsBar from './ReviewActionsBar';

type Props = {
  item: ReviewItem | null;
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

export default function ReviewDetailPanel({ item, notes, busy, pendingAction, onNotesChange, onApprove, onReject, onPublish, onUnpublish, onExpire }: Props) {
  if (!item) {
    return <div className="rounded-[2rem] border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Select a review item to inspect details and actions.</div>;
  }

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Detail Panel</p>
        <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">{item.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{item.subtitle}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">{item.reviewStatusLabel}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">{item.publishStatusLabel}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">{item.expirationLabel}</span>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
          <p>Created: {item.createdAtLabel}</p>
          <p>Updated: {item.updatedAtLabel}</p>
          <p>Published At: {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : 'Not published'}</p>
          <p>Expires At: {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : 'No expiration set'}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {item.reviewFields.map((field) => (
          <div key={field.label} className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{field.label}</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{field.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Operational Summary</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.summary}</p>
      </div>

      <ReviewActionsBar
        item={item}
        notes={notes}
        busy={busy}
        pendingAction={pendingAction}
        onNotesChange={onNotesChange}
        onApprove={onApprove}
        onReject={onReject}
        onPublish={onPublish}
        onUnpublish={onUnpublish}
        onExpire={onExpire}
      />

      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Operational Notes</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {item.operationalNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
