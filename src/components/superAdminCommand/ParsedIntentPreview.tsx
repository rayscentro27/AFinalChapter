import React from 'react';
import type { ParsedIntent } from '../../hooks/useSuperAdminCommandCenter';
import CommandStatusBadge from './CommandStatusBadge';

type Props = {
  intent: ParsedIntent | null;
};

export default function ParsedIntentPreview({ intent }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Parsed Intent Preview</p>
      {intent ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <CommandStatusBadge label={intent.commandType} />
            <CommandStatusBadge label={intent.validationStatus} />
            <CommandStatusBadge label={intent.confidenceLabel} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Target: {intent.targetLabel}</div>
          <div className="space-y-2">
            {intent.notes.map((note) => (
              <div key={note} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{note}</div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">Preview becomes available once the backend returns parsed intent data for a submitted or selected command.</div>
      )}
    </section>
  );
}