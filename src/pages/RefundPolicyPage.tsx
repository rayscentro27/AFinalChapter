import React from 'react';
import DynamicLegalPage from '../../components/legal/DynamicLegalPage';
import { REFUND_POLICY_SECTIONS } from '../../components/legal/legalContent';

export default function RefundPolicyPage() {
  return (
    <DynamicLegalPage
      docKey="refund_policy"
      fallbackTitle="Refund Policy"
      fallbackSubtitle="Billing and cancellation policy for platform access and membership services."
      fallbackContent={(
        <>
          {REFUND_POLICY_SECTIONS.map((section) => (
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
