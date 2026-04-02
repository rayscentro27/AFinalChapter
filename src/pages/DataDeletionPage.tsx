import React from 'react';
import LegalPageLayout from '../../components/legal/LegalPageLayout';

const SUPPORT_EMAIL = 'theworldzmine@gmail.com';

export default function DataDeletionPage() {
  return (
    <LegalPageLayout
      title="Data Deletion Request"
      subtitle="How to request deletion of your Nexus account data and related records."
    >
      <section className="space-y-3">
        <h2 className="text-xl font-black text-white tracking-tight">How to request deletion</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Send an email to{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Data%20Deletion%20Request`}
            className="text-cyan-300 hover:text-cyan-200 font-semibold"
          >
            {SUPPORT_EMAIL}
          </a>{' '}
          with the subject line <span className="font-semibold text-white">Data Deletion Request</span>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-black text-white tracking-tight">Include this information</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-slate-300 leading-relaxed">
          <li>The email address used for your Nexus account</li>
          <li>Your full name or business name</li>
          <li>Your Instagram handle or connected account name if the request relates to messaging data</li>
          <li>A clear statement that you want your account data deleted</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-black text-white tracking-tight">What happens next</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          We verify the request, remove or anonymize eligible account data, and complete deletion subject to
          legal, security, and operational retention requirements. Some records may be kept where required by law
          or to prevent fraud, resolve disputes, or meet compliance obligations.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-black text-white tracking-tight">Alternative contact</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          If you cannot email us, you can submit the request through the app support channels and reference the
          same deletion details.
        </p>
      </section>
    </LegalPageLayout>
  );
}
