import React from 'react';

type PrivacyProofPanelProps = {
  sanitizedPayload: unknown;
  redactionReport?: unknown;
  className?: string;
};

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

export default function PrivacyProofPanel({ sanitizedPayload, redactionReport, className = '' }: PrivacyProofPanelProps) {
  return (
    <section className={`rounded-2xl border border-cyan-500/30 bg-slate-900 p-5 text-slate-100 space-y-4 ${className}`}>
      <div>
        <h2 className="text-lg font-black text-white">Privacy Proof</h2>
        <p className="text-xs text-slate-400 mt-1">
          This is the sanitized payload used for AI drafting. Raw credit report PDFs and direct identifiers are not sent.
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
        <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Sanitized AI Payload</p>
        <pre className="text-[11px] text-cyan-200 whitespace-pre-wrap break-words max-h-72 overflow-auto">{pretty(sanitizedPayload)}</pre>
      </div>

      {redactionReport ? (
        <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Redaction Report</p>
          <pre className="text-[11px] text-slate-200 whitespace-pre-wrap break-words max-h-56 overflow-auto">{pretty(redactionReport)}</pre>
        </div>
      ) : null}

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-200 space-y-1">
        <p className="font-bold uppercase tracking-wider">Never Sent to AI</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Raw AnnualCreditReport PDF files</li>
          <li>Full legal name and full street address</li>
          <li>Date of birth and Social Security Number</li>
          <li>Full account numbers</li>
        </ul>
      </div>
    </section>
  );
}
