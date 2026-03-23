import React from 'react';

type Props = {
  draft: string;
  setDraft: (value: string) => void;
  submitting: boolean;
  submitError: string;
  onSubmit: () => void;
};

export default function CommandComposer({ draft, setDraft, submitting, submitError, onSubmit }: Props) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Plain-Language Command</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">Issue a super admin instruction</h2>
      <p className="mt-2 text-sm text-slate-500">Write the command in plain language. The backend parser remains the source of truth for validation and routing.</p>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Example: Review this website for grant opportunities and queue any promising sources for follow-up."
        className="mt-5 min-h-[11rem] w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-slate-400"
      />
      {submitError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{submitError}</div> : null}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">The UI only shows confirmed backend status. Rejections stay visible as rejections.</p>
        <button type="button" onClick={onSubmit} disabled={submitting} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white disabled:opacity-50">
          {submitting ? 'Submitting...' : 'Submit Command'}
        </button>
      </div>
    </section>
  );
}