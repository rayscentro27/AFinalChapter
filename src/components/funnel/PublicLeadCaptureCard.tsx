import React, { useMemo, useState } from 'react';
import { captureLead } from '../../services/funnelService';
import { isValidEmail, normalizePhoneToE164 } from '../../utils/funnelValidation';

type Props = {
  landingKey: 'free-score' | 'free-checklist';
  title: string;
  subtitle: string;
  points: string[];
};

function getUtmSource(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source') || '',
    utm_medium: params.get('utm_medium') || '',
    utm_campaign: params.get('utm_campaign') || '',
    ref: params.get('ref') || document.referrer || '',
  };
}

export default function PublicLeadCaptureCard({ landingKey, title, subtitle, points }: Props) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const sourcePayload = useMemo(() => {
    const utm = getUtmSource();
    return {
      ...utm,
      landing_page: landingKey,
    };
  }, [landingKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }

    if (!marketingOptIn) {
      setError('Please confirm marketing opt-in to receive the educational sequence.');
      return;
    }

    const normalizedPhone = normalizePhoneToE164(phone);
    if (phone && !normalizedPhone) {
      setError('Phone number format is invalid. Use +15551234567 when possible.');
      return;
    }

    setLoading(true);
    try {
      await captureLead({
        email,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        phone_e164: normalizedPhone || undefined,
        marketing_opt_in: marketingOptIn,
        source: sourcePayload,
      });

      setSuccess('You are in. Check your email for educational next steps.');
      setEmail('');
      setFirstName('');
      setLastName('');
      setPhone('');
      setMarketingOptIn(false);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-cyan-500/20 bg-slate-900 p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Nexus Educational Toolkit</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white">{title}</h1>
          <p className="mt-3 text-sm text-slate-300">{subtitle}</p>
          <ul className="mt-5 space-y-2 text-sm text-slate-300">
            {points.map((point) => (
              <li key={point} className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2">{point}</li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-slate-500">
            Educational tools only. No legal, tax, accounting, financial, or investment advice. No guarantees of approvals, deletions, or outcomes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-700 bg-slate-900 p-8 space-y-4">
          <h2 className="text-2xl font-black text-white">Get Access</h2>
          <p className="text-sm text-slate-400">Enter your info to start the educational nurture sequence.</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              placeholder="First name (optional)"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              placeholder="Last name (optional)"
            />
          </div>

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            placeholder="Email address"
          />

          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            placeholder="Phone (optional)"
          />

          <label className="flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-800/70 p-3 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I agree to receive educational emails from Nexus. I can unsubscribe at any time.
            </span>
          </label>

          <p className="text-xs text-slate-500">
            By submitting, you agree to the <a href="/privacy" className="text-cyan-300">Privacy Policy</a> and <a href="/disclaimers" className="text-cyan-300">Disclaimers</a>.
          </p>

          {error ? <div className="rounded-xl border border-rose-500/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{error}</div> : null}
          {success ? <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">{success}</div> : null}

          <button
            disabled={loading}
            type="submit"
            className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-60"
          >
            {loading ? 'Submitting...' : 'Send My Educational Access'}
          </button>

          <a href="/signup" className="block text-center text-xs text-cyan-300">Already ready? Create free account</a>
        </form>
      </div>
    </div>
  );
}
