import React from 'react';
import DynamicLegalPage from '../../components/legal/DynamicLegalPage';
import { AI_DISCLOSURE_SECTIONS } from '../../components/legal/legalContent';

export default function AIDisclosurePage() {
  return (
    <DynamicLegalPage
      docKey="ai_disclosure"
      fallbackTitle="AI Disclosure"
      fallbackSubtitle="Important information on how AI-generated output should be interpreted and reviewed."
      fallbackContent={(
        <>
          {AI_DISCLOSURE_SECTIONS.map((section) => (
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
