import React from 'react';
import type { RelatedSource } from '../../hooks/useCommandInbox';
import SourceStatusBadge from '../sourceRegistry/SourceStatusBadge';

type Props = {
  item: RelatedSource | null;
  onOpenSourceRegistry?: (item: RelatedSource) => void;
};

export default function RelatedSourceCard({ item, onOpenSourceRegistry }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Related Source</p>
      {item ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">{item.label}</h3>
            <SourceStatusBadge status={item.status} />
          </div>
          <a href={item.url} target="_blank" rel="noreferrer" className="block text-sm text-sky-700 underline">{item.url}</a>
          <button type="button" onClick={() => onOpenSourceRegistry?.(item)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">
            Open In Source Registry
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">This command has not created or linked a source record yet.</div>
      )}
    </section>
  );
}