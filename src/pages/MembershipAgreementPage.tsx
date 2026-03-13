import React from 'react';
import DynamicLegalPage from '../../components/legal/DynamicLegalPage';

export default function MembershipAgreementPage() {
  return (
    <DynamicLegalPage
      docKey="membership_agreement"
      fallbackTitle="Membership Agreement"
      fallbackSubtitle="Paid membership terms for FREE, GROWTH, and PREMIUM tiers."
      fallbackContent={(
        <>
          <section className="space-y-2">
            <h2 className="text-xl font-black text-white">Auto-Renew and Cancellation</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Paid memberships auto-renew each billing cycle until canceled. You may cancel anytime to prevent future renewal.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-black text-white">Educational Scope and No Guarantees</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Platform services provide educational templates, workflow tools, and process support. Results vary and no funding,
              credit, grant, or investment outcome is guaranteed.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-black text-white">Refund Position</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Refunds are not performance-based and are evaluated under the published refund policy.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-black text-white">Limitation of Liability</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Liability is limited to fees paid for the relevant period to the extent allowed by law. External third-party decisions
              and system dependencies are outside guaranteed control.
            </p>
          </section>
        </>
      )}
    />
  );
}
