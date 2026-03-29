import React from 'react';
import useLegalDocument from '../../hooks/useLegalDocument';
import { DISCLAIMER_BULLETS } from './legalContent';
import { extractMarkdownListItems } from './legalDocuments';

type RequiredDisclaimersProps = {
  variant?: 'badge' | 'panel';
  title?: string;
};

export default function RequiredDisclaimers({ variant = 'panel', title = 'Required Disclaimers' }: RequiredDisclaimersProps) {
  const shouldLoadDocument = variant !== 'badge';
  const { document } = useLegalDocument('disclaimers', shouldLoadDocument);

  if (variant === 'badge') {
    return (
      <a
        href="/disclaimers"
        className="inline-flex items-center gap-2 rounded-full border border-[#F2DEAE] bg-[linear-gradient(180deg,#FFF8E6_0%,#FFF2D6_100%)] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#B98518] transition-colors hover:bg-[#FFF0CC]"
      >
        Educational Only
      </a>
    );
  }

  const dynamicBullets = document?.markdown_body
    ? extractMarkdownListItems(document.markdown_body)
    : [];

  const bullets = dynamicBullets.length > 0 ? dynamicBullets : DISCLAIMER_BULLETS;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-amber-700">{title}</h3>
      <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-slate-700">
        {bullets.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {document?.version ? (
        <p className="mt-3 text-[11px] text-amber-700/80">Version: {document.version}</p>
      ) : null}
    </div>
  );
}
