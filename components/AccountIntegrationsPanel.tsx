import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, Shield, AlertTriangle, Link2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

type Provider = 'facebook' | 'mailerlite' | 'stripe';

type Integration = {
  id: string;
  provider: Provider;
  status: 'connected' | 'error' | 'disconnected';
  connected_at?: string | null;
  last_tested_at?: string | null;
  last_error?: string | null;
  credentials_masked?: Record<string, string>;
};

type ProviderForm = {
  facebook: { access_token: string; page_id: string };
  mailerlite: { api_key: string; group_id: string };
  stripe: { secret_key: string; publishable_key: string };
};

const providerLabels: Record<Provider, string> = {
  facebook: 'Facebook',
  mailerlite: 'MailerLite',
  stripe: 'Stripe',
};

const initialForm: ProviderForm = {
  facebook: { access_token: '', page_id: '' },
  mailerlite: { api_key: '', group_id: '' },
  stripe: { secret_key: '', publishable_key: '' },
};

async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export default function AccountIntegrationsPanel() {
  const [tenantId, setTenantId] = useState('');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [form, setForm] = useState<ProviderForm>(initialForm);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [testingProvider, setTestingProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const byProvider = useMemo(() => {
    const map: Partial<Record<Provider, Integration>> = {};
    for (const row of integrations) map[row.provider] = row;
    return map;
  }, [integrations]);

  const load = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) throw new Error('Sign in required to manage integrations.');

      const qs = tenantId.trim() ? `?tenant_id=${encodeURIComponent(tenantId.trim())}` : '';
      const res = await fetch(`/.netlify/functions/integration_list${qs}`, {
        method: 'GET',
        headers,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json?.error || `Failed to load integrations (${res.status})`));

      setIntegrations(Array.isArray(json.integrations) ? json.integrations : []);
      if (json.tenant_id && !tenantId.trim()) setTenantId(String(json.tenant_id));
    } catch (e: any) {
      setError(e?.message || 'Failed to load integrations');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (provider: Provider) => {
    setLoadingProvider(provider);
    setError(null);
    setSuccess(null);

    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) throw new Error('Sign in required to manage integrations.');

      const res = await fetch('/.netlify/functions/integration_upsert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          tenant_id: tenantId.trim() || undefined,
          provider,
          credentials: form[provider],
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json?.error || `Save failed (${res.status})`));

      setSuccess(`${providerLabels[provider]} credentials saved.`);
      await load();
    } catch (e: any) {
      setError(e?.message || `Failed to save ${providerLabels[provider]} credentials.`);
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleTest = async (provider: Provider) => {
    setTestingProvider(provider);
    setError(null);
    setSuccess(null);

    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) throw new Error('Sign in required to test integrations.');

      const res = await fetch('/.netlify/functions/integration_test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          tenant_id: tenantId.trim() || undefined,
          provider,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json?.error || json?.test?.error || `Test failed (${res.status})`));

      setSuccess(`${providerLabels[provider]} test passed.`);
      await load();
    } catch (e: any) {
      setError(e?.message || `Failed to test ${providerLabels[provider]}.`);
      await load();
    } finally {
      setTestingProvider(null);
    }
  };

  return (
    <div className="space-y-6 rounded-[2.5rem] border border-[#E2EAF7] bg-white p-8 shadow-[0_18px_44px_rgba(41,72,138,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Link2 size={18} className="text-blue-600" /> Stack Integration Manager
          </h4>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            Connect and manage your core business stack (CRM, email, payments, and more). Credentials are stored securely and never shown in full.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loadingList}
          className="flex items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#2E58E6,#4D8BFF)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_12px_24px_rgba(46,88,230,0.18)]"
        >
          {loadingList ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Tenant ID (optional)</label>
          <input
            type="text"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="Auto-resolved from your membership"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
          />
        </div>
        <div className="rounded-xl border border-[#DCE7FA] bg-[#F4F8FF] p-3 text-xs text-[#4866A4]">
          <div className="font-black uppercase tracking-widest text-[10px] mb-1">Compliance</div>
          Consent-based messaging only. No guarantees or pressure language in outbound automations.
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5" /> {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 flex items-start gap-2">
          <CheckCircle2 size={16} className="mt-0.5" /> {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(['facebook', 'mailerlite', 'stripe'] as Provider[]).map((provider) => {
          const row = byProvider[provider];
          const badgeColor = row?.status === 'connected'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : row?.status === 'error'
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-slate-100 text-slate-600 border-slate-200';

          return (
            <div key={provider} className="space-y-3 rounded-2xl border border-[#E2EAF7] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="font-black text-slate-900 uppercase tracking-tight">{providerLabels[provider]}</div>
                <span className={`px-2 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider ${badgeColor}`}>
                  {row?.status || 'disconnected'}
                </span>
              </div>

              {provider === 'facebook' && (
                <>
                  <input
                    type="password"
                    placeholder="Access Token"
                    value={form.facebook.access_token}
                    onChange={(e) => setForm((prev) => ({ ...prev, facebook: { ...prev.facebook, access_token: e.target.value } }))}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Page ID (optional)"
                    value={form.facebook.page_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, facebook: { ...prev.facebook, page_id: e.target.value } }))}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm"
                  />
                </>
              )}
              {provider === 'mailerlite' && (
                <>
                  <input
                    type="password"
                    placeholder="MailerLite API Key"
                    value={form.mailerlite.api_key}
                    onChange={(e) => setForm((prev) => ({ ...prev, mailerlite: { ...prev.mailerlite, api_key: e.target.value } }))}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Group ID (optional)"
                    value={form.mailerlite.group_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, mailerlite: { ...prev.mailerlite, group_id: e.target.value } }))}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm"
                  />
                </>
              )}

              {provider === 'stripe' && (
                <>
                  <input
                    type="password"
                    placeholder="Stripe Secret Key (sk_...)"
                    value={form.stripe.secret_key}
                    onChange={(e) => setForm((prev) => ({ ...prev, stripe: { ...prev.stripe, secret_key: e.target.value } }))}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Stripe Publishable Key (optional)"
                    value={form.stripe.publishable_key}
                    onChange={(e) => setForm((prev) => ({ ...prev, stripe: { ...prev.stripe, publishable_key: e.target.value } }))}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm"
                  />
                </>
              )}

              {row?.credentials_masked && Object.keys(row.credentials_masked).length > 0 && (
                <div className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-xl p-2">
                  <span className="font-black uppercase text-[9px] tracking-widest text-slate-400">Saved:</span>{' '}
                  {Object.entries(row.credentials_masked).map(([k, v]) => `${k}=${v}`).join(' | ')}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleSave(provider)}
                  disabled={loadingProvider === provider}
                  className="flex-1 rounded-xl border border-[#D6E5FF] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#315FD0] disabled:opacity-50"
                >
                  {loadingProvider === provider ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => handleTest(provider)}
                  disabled={testingProvider === provider}
                  className="flex-1 rounded-xl bg-[linear-gradient(135deg,#2E58E6,#4D8BFF)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50 shadow-[0_10px_20px_rgba(46,88,230,0.16)]"
                >
                  {testingProvider === provider ? 'Testing...' : 'Test'}
                </button>
              </div>

              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <Shield size={12} /> Last tested: {row?.last_tested_at ? new Date(row.last_tested_at).toLocaleString() : 'never'}
              </div>
              {row?.last_error && <div className="text-[11px] text-red-600">{row.last_error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
