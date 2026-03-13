import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { getSmsConsentStatus, normalizePhoneToE164, SmsConsentStatus } from '../../utils/smsConsent';

type TenantMembershipRow = { tenant_id: string };

type EspContactRow = {
  unsubscribed: boolean;
  consent_transactional: boolean;
  consent_marketing: boolean;
};

async function resolveTenantId(userId: string): Promise<string | null> {
  const preferred = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!preferred.error && preferred.data?.tenant_id) {
    return String((preferred.data as TenantMembershipRow).tenant_id);
  }

  const fallback = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!fallback.error && (fallback.data as any)?.tenant_id) {
    return String((fallback.data as any).tenant_id);
  }

  return null;
}

async function hashMarker(input: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((i) => i.toString(16).padStart(2, '0')).join('');
}

export default function CommunicationPreferencesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [marketingEmailOptIn, setMarketingEmailOptIn] = useState(false);
  const [unsubscribeAllEmails, setUnsubscribeAllEmails] = useState(false);

  const [smsStatus, setSmsStatus] = useState<SmsConsentStatus | null>(null);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsMarketingPurpose, setSmsMarketingPurpose] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const resolvedTenantId = await resolveTenantId(user.id);
        if (!active) return;
        setTenantId(resolvedTenantId);

        const [prefRes, status, contactRes] = await Promise.all([
          supabase
            .from('communication_preferences')
            .select('marketing_email_opt_in')
            .eq('user_id', user.id)
            .maybeSingle(),
          getSmsConsentStatus(user.id),
          resolvedTenantId
            ? supabase
              .from('esp_contacts')
              .select('unsubscribed,consent_transactional,consent_marketing')
              .eq('tenant_id', resolvedTenantId)
              .or(`user_id.eq.${user.id},email.eq.${String(user.email || '').toLowerCase()}`)
              .limit(1)
              .maybeSingle()
            : Promise.resolve({ data: null, error: null } as { data: EspContactRow | null; error: any }),
        ]);

        if (!active) return;

        if (prefRes.error) {
          throw new Error(prefRes.error.message || 'Unable to load communication preferences.');
        }

        if ((contactRes as any).error) {
          throw new Error((contactRes as any).error.message || 'Unable to load contact email preferences.');
        }

        const contact = ((contactRes as any).data || null) as EspContactRow | null;
        const unsubscribed = Boolean(contact?.unsubscribed);
        setUnsubscribeAllEmails(unsubscribed);

        const marketingFromPref = Boolean(prefRes.data?.marketing_email_opt_in);
        const marketingFromContact = Boolean(contact?.consent_marketing);
        const nextMarketing = marketingFromPref || marketingFromContact;
        setMarketingEmailOptIn(unsubscribed ? false : nextMarketing);

        setSmsStatus(status);
        setSmsOptIn(Boolean(status?.is_opted_in));
        setSmsPhone(status?.phone_e164 || '');
        setSmsMarketingPurpose(Boolean(status?.purpose?.includes('marketing')));
      } catch (e: any) {
        if (active) setError(String(e?.message || e));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [user?.id]);

  async function savePreferences() {
    if (!user?.id) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const now = new Date().toISOString();
      const userAgent = navigator.userAgent || 'unknown';
      const ipHash = await hashMarker(`${user.id}:${now}:communication_pref`);

      const effectiveMarketingOptIn = !unsubscribeAllEmails && marketingEmailOptIn;

      const { error: prefError } = await supabase.from('communication_preferences').upsert({
        user_id: user.id,
        tenant_id: tenantId,
        marketing_email_opt_in: effectiveMarketingOptIn,
        updated_at: now,
      });

      if (prefError) {
        throw new Error(prefError.message || 'Unable to save email marketing preference.');
      }

      const commsVersionRes = await supabase
        .from('consent_requirements')
        .select('current_version')
        .eq('consent_type', 'comms_email')
        .limit(1)
        .maybeSingle();

      const requiredCommsVersion = String(commsVersionRes.data?.current_version || 'v1');

      if (unsubscribeAllEmails) {
        const { error: commsOptOutError } = await supabase.from('consents').upsert({
          user_id: user.id,
          tenant_id: tenantId,
          consent_type: 'comms_email',
          version: 'opt_out_v1',
          accepted_at: now,
          ip_hash: ipHash,
          user_agent: userAgent,
          metadata: {
            source: 'communication_preferences',
            action: 'unsubscribe_all',
            unsubscribed: true,
          },
        }, {
          onConflict: 'user_id,consent_type,version',
        });

        if (commsOptOutError) {
          throw new Error(commsOptOutError.message || 'Unable to save email unsubscribe event.');
        }
      } else {
        const { error: commsConsentError } = await supabase.from('consents').upsert({
          user_id: user.id,
          tenant_id: tenantId,
          consent_type: 'comms_email',
          version: requiredCommsVersion,
          accepted_at: now,
          ip_hash: ipHash,
          user_agent: userAgent,
          metadata: {
            source: 'communication_preferences',
            action: 'marketing_preference_updated',
            marketing_email_opt_in: effectiveMarketingOptIn,
            unsubscribed: false,
          },
        }, {
          onConflict: 'user_id,consent_type,version',
        });

        if (commsConsentError) {
          throw new Error(commsConsentError.message || 'Unable to save communication consent event.');
        }
      }

      if (tenantId && user.email) {
        const { error: contactError } = await supabase
          .from('esp_contacts')
          .upsert({
            tenant_id: tenantId,
            user_id: user.id,
            email: String(user.email).toLowerCase(),
            full_name: user.name || null,
            consent_transactional: !unsubscribeAllEmails,
            consent_marketing: effectiveMarketingOptIn,
            unsubscribed: unsubscribeAllEmails,
            updated_at: now,
          }, {
            onConflict: 'tenant_id,email',
          });

        if (contactError) {
          throw new Error(contactError.message || 'Unable to update email contact preferences.');
        }
      }

      await supabase.functions.invoke('funnel-engine', {
        body: { action: 'link-signup' },
      });

      if (tenantId) {
        const leadLinkRes = await supabase
          .from('lead_user_links')
          .select('lead_id')
          .eq('tenant_id', tenantId)
          .eq('user_id', user.id)
          .order('linked_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const leadId = String((leadLinkRes.data as any)?.lead_id || '');
        if (leadId) {
          const nextLeadStatus = unsubscribeAllEmails ? 'unsubscribed' : 'converted';

          await supabase
            .from('leads')
            .update({
              marketing_opt_in: effectiveMarketingOptIn,
              status: nextLeadStatus,
            })
            .eq('id', leadId);

          await supabase.from('lead_events').insert({
            tenant_id: tenantId,
            lead_id: leadId,
            event_type: unsubscribeAllEmails ? 'LEAD_UNSUBSCRIBED' : 'OPTIN_CONFIRMED',
            payload: {
              source: 'settings_communication',
              marketing_opt_in: effectiveMarketingOptIn,
              unsubscribed: unsubscribeAllEmails,
            },
          });
        }
      }

      const normalizedPhone = normalizePhoneToE164(smsPhone);
      if (smsOptIn && !normalizedPhone) {
        throw new Error('Enter a valid phone number in E.164 format (example: +15551234567).');
      }

      if (smsOptIn) {
        const purpose = smsMarketingPurpose ? ['transactional', 'marketing'] : ['transactional'];

        const { error: smsError } = await supabase.from('consents').upsert({
          user_id: user.id,
          tenant_id: tenantId,
          consent_type: 'sms_opt_in',
          version: 'v1',
          accepted_at: now,
          ip_hash: ipHash,
          user_agent: userAgent,
          metadata: {
            phone_e164: normalizedPhone,
            purpose,
          },
        }, {
          onConflict: 'user_id,consent_type,version',
        });

        if (smsError) {
          throw new Error(smsError.message || 'Unable to save SMS opt-in consent.');
        }
      } else {
        const fallbackPhone = normalizePhoneToE164(smsPhone) || smsStatus?.phone_e164 || null;

        const { error: smsOutError } = await supabase.from('consents').insert({
          user_id: user.id,
          tenant_id: tenantId,
          consent_type: 'sms_opt_out',
          version: 'v1',
          accepted_at: now,
          ip_hash: ipHash,
          user_agent: userAgent,
          metadata: {
            phone_e164: fallbackPhone,
            method: 'settings',
            timestamp: now,
          },
        });

        if (smsOutError) {
          throw new Error(smsOutError.message || 'Unable to save SMS opt-out record.');
        }
      }

      if (tenantId) {
        await supabase.from('audit_events').insert({
          tenant_id: tenantId,
          actor_user_id: user.id,
          event_type: 'communication_preferences.updated',
          metadata: {
            phone_e164: normalizePhoneToE164(smsPhone) || smsStatus?.phone_e164 || null,
            source: 'communication_preferences',
            marketing_email_opt_in: effectiveMarketingOptIn,
            unsubscribe_all_emails: unsubscribeAllEmails,
            sms_opt_in: smsOptIn,
          },
        });
      }

      const refreshed = await getSmsConsentStatus(user.id);
      setSmsStatus(refreshed);
      setSmsOptIn(Boolean(refreshed?.is_opted_in));
      setSmsPhone(refreshed?.phone_e164 || smsPhone);
      setMarketingEmailOptIn(effectiveMarketingOptIn);
      setSuccess('Communication preferences updated.');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Sign in required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading preferences...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 text-slate-100 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Communication Preferences</h1>
        <p className="text-sm text-slate-400 mt-2">
          Transactional email is enabled by default for account and security notices. Marketing channels are optional.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">{success}</div> : null}

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <h2 className="text-lg font-bold text-white">Email</h2>

        <label className="flex items-start gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            className="mt-1"
            checked={marketingEmailOptIn}
            onChange={() => setMarketingEmailOptIn((v) => !v)}
            disabled={unsubscribeAllEmails}
          />
          <span>Receive optional marketing email updates.</span>
        </label>

        <label className="flex items-start gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            className="mt-1"
            checked={unsubscribeAllEmails}
            onChange={() => {
              setUnsubscribeAllEmails((v) => {
                const next = !v;
                if (next) setMarketingEmailOptIn(false);
                return next;
              });
            }}
          />
          <span>Unsubscribe from all Nexus email communications (transactional and marketing).</span>
        </label>

        <p className="text-xs text-slate-500">
          Transactional account notices stay on unless you choose to unsubscribe from all email.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <h2 className="text-lg font-bold text-white">SMS</h2>

        <label className="block text-xs uppercase tracking-widest text-slate-400">Phone Number (E.164)</label>
        <input
          type="tel"
          value={smsPhone}
          onChange={(e) => setSmsPhone(e.target.value)}
          placeholder="+15551234567"
          className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
        />

        <label className="flex items-start gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            className="mt-1"
            checked={smsOptIn}
            onChange={() => setSmsOptIn((v) => !v)}
          />
          <span>
            I agree to receive SMS notifications from Nexus regarding my account, tasks, and service updates. Message and data rates may apply. Reply STOP to opt out.
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            className="mt-1"
            checked={smsMarketingPurpose}
            onChange={() => setSmsMarketingPurpose((v) => !v)}
            disabled={!smsOptIn}
          />
          <span>Also allow optional marketing SMS notices.</span>
        </label>

        <div className="text-xs text-slate-500">
          Current status: {smsStatus?.is_opted_in ? 'Opted in' : 'Opted out'}{smsStatus?.phone_e164 ? ` (${smsStatus.phone_e164})` : ''}
        </div>

        <p className="text-xs text-slate-500">
          SMS consent is optional and no purchase is required. Review full terms: <a href="/sms-terms" className="text-cyan-300 hover:text-cyan-200">SMS Terms</a>.
        </p>
      </section>

      <div className="flex justify-end">
        <button
          onClick={() => void savePreferences()}
          disabled={saving}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
