import React from 'react';
import DynamicLegalPage from '../../components/legal/DynamicLegalPage';
import { TERMS_SECTIONS } from '../../components/legal/legalContent';

export default function TermsPage() {
  return (
    <DynamicLegalPage
      docKey="terms"
      fallbackTitle="Terms of Service"
      fallbackSubtitle="These terms govern platform access and educational workflow usage."
      fallbackContent={(
        <>
          {TERMS_SECTIONS.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-xl font-black text-white tracking-tight">{section.title}</h2>
              <p className="text-sm text-slate-300 leading-relaxed">{section.body}</p>
            </section>
          ))}
        </>
      )}
    />
  );
}
