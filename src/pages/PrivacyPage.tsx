import React from 'react';
import DynamicLegalPage from '../../components/legal/DynamicLegalPage';
import { PRIVACY_SECTIONS } from '../../components/legal/legalContent';

export default function PrivacyPage() {
  return (
    <DynamicLegalPage
      docKey="privacy"
      fallbackTitle="Privacy Policy"
      fallbackSubtitle="How platform data is processed, protected, and used for service delivery."
      fallbackContent={(
        <>
          {PRIVACY_SECTIONS.map((section) => (
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
