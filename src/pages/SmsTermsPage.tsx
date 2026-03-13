import React from 'react';
import DynamicLegalPage from '../../components/legal/DynamicLegalPage';

export default function SmsTermsPage() {
  return (
    <DynamicLegalPage
      docKey="sms_terms"
      fallbackTitle="SMS Terms"
      fallbackSubtitle="Message consent, frequency, and opt-out/help handling for Nexus SMS notifications."
      fallbackContent={(
        <>
          <section className="space-y-2">
            <h2 className="text-xl font-black text-white tracking-tight">Message Scope</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              SMS notifications may include account updates, task reminders, billing alerts, and optional marketing content depending on your preferences.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-black text-white tracking-tight">Frequency and Carrier Charges</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Message frequency varies. Message and data rates may apply based on your carrier plan.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-black text-white tracking-tight">STOP and HELP</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Reply STOP to opt out of SMS messages. Reply HELP for support instructions.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-black text-white tracking-tight">No Purchase Required</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              SMS consent is optional and not required to purchase any service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-black text-white tracking-tight">Privacy Link</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              See the <a href="/privacy" className="text-cyan-300 hover:text-cyan-200">Privacy Policy</a> for data use details.
            </p>
          </section>
        </>
      )}
    />
  );
}
