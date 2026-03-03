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
        className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-200 hover:bg-amber-400/20 transition-colors"
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
    <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-amber-100">
      <h3 className="text-xs font-black uppercase tracking-widest mb-3">{title}</h3>
      <ul className="space-y-2 text-xs leading-relaxed list-disc pl-4">
        {bullets.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {document?.version ? (
        <p className="mt-3 text-[11px] text-amber-200/80">Version: {document.version}</p>
      ) : null}
    </div>
  );
}
