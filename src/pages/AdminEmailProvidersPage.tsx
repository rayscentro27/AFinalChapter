import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

type Provider = 'brevo' | 'mailerlite';

type Tenant = {
  id: string;
  name: string | null;
};

type ProviderRow = {
  provider: Provider;
  is_enabled: boolean;
  priority: number;
  capabilities: Record<string, unknown>;
  config: Record<string, unknown>;
};

type DraftRow = {
  provider: Provider;
  is_enabled: boolean;
  priority: number;
  capabilitiesText: string;
  configText: string;
};

const PROVIDERS: Provider[] = ['brevo', 'mailerlite'];

const DEFAULT_PROVIDER_SETTINGS: Record<Provider, { isEnabled: boolean; priority: number; capabilities: Record<string, unknown> }> = {
  brevo: {
    isEnabled: true,
    priority: 10,
    capabilities: { transactional: true, marketing: true },
  },
  mailerlite: {
    isEnabled: false,
    priority: 20,
    capabilities: { transactional: false, marketing: true, contact_sync: true },
  },
};

function parseJsonObject(input: string): Record<string, unknown> {
  const trimmed = String(input || '').trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON must be an object.');
  }
  return parsed as Record<string, unknown>;
}

function mapToDraftRows(rows: ProviderRow[]): DraftRow[] {
  return PROVIDERS.map((provider) => {
    const found = rows.find((row) => row.provider === provider);
    const defaults = DEFAULT_PROVIDER_SETTINGS[provider];

    return {
      provider,
      is_enabled: found ? Boolean(found.is_enabled) : defaults.isEnabled,
      priority: found ? Number(found.priority || defaults.priority) : defaults.priority,
      capabilitiesText: JSON.stringify(found?.capabilities || defaults.capabilities, null, 2),
      configText: JSON.stringify(found?.config || {}, null, 2),
    };
  });
}

export default function AdminEmailProvidersPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [draftRows, setDraftRows] = useState<DraftRow[]>(mapToDraftRows([]));

  async function loadProviders(nextTenantId: string) {
    if (!nextTenantId) {
      setDraftRows(mapToDraftRows([]));
      return;
    }

    const { data, error: readError } = await supabase
      .from('esp_providers')
      .select('provider,is_enabled,priority,capabilities,config')
      .eq('tenant_id', nextTenantId)
      .order('priority', { ascending: true });

    if (readError) {
      throw new Error(readError.message || 'Unable to load provider settings.');
    }

    setDraftRows(mapToDraftRows((data || []) as ProviderRow[]));
  }

  useEffect(() => {
    let active = true;

    async function boot() {
      if (!isSuperAdmin) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const { data, error: tenantError } = await supabase
          .from('tenants')
          .select('id,name')
          .order('name', { ascending: true });

        if (tenantError) throw new Error(tenantError.message || 'Unable to load tenants.');
        if (!active) return;

        const nextTenants = (data || []) as Tenant[];
        setTenants(nextTenants);

        const firstTenantId = nextTenants[0]?.id || '';
        setTenantId(firstTenantId);
        await loadProviders(firstTenantId);
      } catch (e: any) {
        if (active) setError(String(e?.message || e));
      } finally {
        if (active) setLoading(false);
      }
    }

    void boot();

    return () => {
      active = false;
    };
  }, [isSuperAdmin]);

  async function saveAll() {
    if (!tenantId) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = draftRows.map((row) => ({
        tenant_id: tenantId,
        provider: row.provider,
        is_enabled: row.is_enabled,
        priority: Number(row.priority || 100),
        capabilities: parseJsonObject(row.capabilitiesText),
        config: parseJsonObject(row.configText),
      }));

      const { error: upsertError } = await supabase
        .from('esp_providers')
        .upsert(payload, { onConflict: 'tenant_id,provider' });

      if (upsertError) throw new Error(upsertError.message || 'Unable to save provider settings.');

      setSuccess('Provider settings saved.');
      await loadProviders(tenantId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Super admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading email providers...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Email Providers</h1>
        <p className="text-sm text-slate-400 mt-1">Brevo is primary for transactional mail. MailerLite is optional for marketing/contact sync.</p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Tenant</label>
        <select
          className="w-full md:w-96 bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm"
          value={tenantId}
          onChange={(e) => {
            const nextTenantId = e.target.value;
            setTenantId(nextTenantId);
            void loadProviders(nextTenantId);
          }}
        >
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
          ))}
        </select>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="space-y-4">
        {draftRows.map((row, index) => (
          <div key={row.provider} className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-300">{row.provider}</h2>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={row.is_enabled}
                  onChange={() => {
                    setDraftRows((prev) => prev.map((item, idx) => idx === index ? { ...item, is_enabled: !item.is_enabled } : item));
                  }}
                />
                Enabled
              </label>
              <label className="text-sm text-slate-300">
                Priority
                <input
                  type="number"
                  className="ml-2 w-24 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
                  value={row.priority}
                  onChange={(e) => {
                    const next = Number(e.target.value || 100);
                    setDraftRows((prev) => prev.map((item, idx) => idx === index ? { ...item, priority: next } : item));
                  }}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Capabilities JSON</label>
                <textarea
                  rows={5}
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-mono"
                  value={row.capabilitiesText}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDraftRows((prev) => prev.map((item, idx) => idx === index ? { ...item, capabilitiesText: next } : item));
                  }}
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Config JSON (non-secret)</label>
                <textarea
                  rows={5}
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-mono"
                  value={row.configText}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDraftRows((prev) => prev.map((item, idx) => idx === index ? { ...item, configText: next } : item));
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => void saveAll()}
          disabled={saving || !tenantId}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Providers'}
        </button>
      </div>
    </div>
  );
}
