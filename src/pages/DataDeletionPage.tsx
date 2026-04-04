import React from 'react';
import LegalPageLayout from '../../components/legal/LegalPageLayout';

const SUPPORT_EMAIL = 'theworldzmine@gmail.com';

export default function DataDeletionPage() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const confirmationCode = params.get('confirmation') || '';
  const status = (params.get('status') || '').toLowerCase();
  const requestHint = params.get('user') || '';

  return (
    <LegalPageLayout
      title="Data Deletion Request"
      subtitle="How to request deletion of your Nexus account data and related records."
    >
      {confirmationCode ? (
        <section className="space-y-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
          <h2 className="text-xl font-black text-white tracking-tight">Request received</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            We received your deletion request and started processing it. Keep this confirmation code for reference:
            <span className="ml-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-emerald-200 font-black tracking-widest">
              {confirmationCode}
            </span>
          </p>
          {requestHint ? (
            <p className="text-xs text-slate-400">
              Request reference: {requestHint}
            </p>
          ) : null}
          <p className="text-xs text-slate-400">
            Status: {status === 'received' ? 'received' : status || 'pending review'}
          </p>
        </section>
      ) : null}

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

      <section className="space-y-3">
        <h2 className="text-xl font-black text-white tracking-tight">Meta review note</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Meta reviewers can also use the app&apos;s data deletion callback endpoint to submit a signed deletion request.
          The callback returns a confirmation code and a status URL on this page.
        </p>
      </section>
    </LegalPageLayout>
  );
}
