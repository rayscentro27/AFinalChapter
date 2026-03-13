import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

type Provider = 'brevo' | 'mailerlite';
type MessageType = 'transactional' | 'billing' | 'system' | 'onboarding' | 'reminders' | 'marketing' | 'newsletter';

type Tenant = { id: string; name: string | null };

type RoutingRow = {
  message_type: MessageType;
  primary_provider: Provider;
  fallback_provider: Provider | null;
  throttle_per_min: number;
};

type DraftRoutingRow = {
  message_type: MessageType;
  primary_provider: Provider;
  fallback_provider: Provider | '';
  throttle_per_min: number;
};

const PROVIDERS: Provider[] = ['brevo', 'mailerlite'];
const MESSAGE_TYPES: MessageType[] = ['transactional', 'billing', 'system', 'onboarding', 'reminders', 'marketing', 'newsletter'];

const DEFAULT_ROUTING: Record<MessageType, { primary: Provider; fallback: Provider | ''; throttle: number }> = {
  transactional: { primary: 'brevo', fallback: '', throttle: 90 },
  billing: { primary: 'brevo', fallback: '', throttle: 90 },
  system: { primary: 'brevo', fallback: '', throttle: 90 },
  onboarding: { primary: 'brevo', fallback: '', throttle: 60 },
  reminders: { primary: 'brevo', fallback: '', throttle: 60 },
  marketing: { primary: 'mailerlite', fallback: 'brevo', throttle: 30 },
  newsletter: { primary: 'mailerlite', fallback: 'brevo', throttle: 30 },
};

function toDraftRows(rows: RoutingRow[]): DraftRoutingRow[] {
  return MESSAGE_TYPES.map((messageType) => {
    const found = rows.find((row) => row.message_type === messageType);
    return {
      message_type: messageType,
      primary_provider: found?.primary_provider || DEFAULT_ROUTING[messageType].primary,
      fallback_provider: found?.fallback_provider || DEFAULT_ROUTING[messageType].fallback,
      throttle_per_min: Number(found?.throttle_per_min || DEFAULT_ROUTING[messageType].throttle),
    };
  });
}

export default function AdminEmailRoutingPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [rows, setRows] = useState<DraftRoutingRow[]>(toDraftRows([]));

  async function loadRouting(nextTenantId: string) {
    if (!nextTenantId) {
      setRows(toDraftRows([]));
      return;
    }

    const { data, error: readError } = await supabase
      .from('esp_routing_rules')
      .select('message_type,primary_provider,fallback_provider,throttle_per_min')
      .eq('tenant_id', nextTenantId)
      .order('message_type', { ascending: true });

    if (readError) {
      throw new Error(readError.message || 'Unable to load email routing rules.');
    }

    setRows(toDraftRows((data || []) as RoutingRow[]));
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
        await loadRouting(firstTenantId);
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

  async function saveRouting() {
    if (!tenantId) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = rows.map((row) => ({
        tenant_id: tenantId,
        message_type: row.message_type,
        primary_provider: row.primary_provider,
        fallback_provider: row.fallback_provider || null,
        throttle_per_min: Number(row.throttle_per_min || 60),
      }));

      const { error: upsertError } = await supabase
        .from('esp_routing_rules')
        .upsert(payload, { onConflict: 'tenant_id,message_type' });

      if (upsertError) throw new Error(upsertError.message || 'Unable to save routing rules.');

      setSuccess('Routing rules saved.');
      await loadRouting(tenantId);
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
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading email routing...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Email Routing Rules</h1>
        <p className="text-sm text-slate-400 mt-1">Brevo is the default transactional provider. MailerLite is optional for marketing with Brevo fallback.</p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Tenant</label>
        <select
          className="w-full md:w-96 bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm"
          value={tenantId}
          onChange={(e) => {
            const nextTenantId = e.target.value;
            setTenantId(nextTenantId);
            void loadRouting(nextTenantId);
          }}
        >
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
          ))}
        </select>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Message Type</th>
                <th className="px-4 py-3 text-left">Primary</th>
                <th className="px-4 py-3 text-left">Fallback</th>
                <th className="px-4 py-3 text-left">Throttle / Min</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((row, index) => (
                <tr key={row.message_type}>
                  <td className="px-4 py-3 font-semibold text-slate-200 uppercase tracking-wider text-xs">{row.message_type}</td>
                  <td className="px-4 py-3">
                    <select
                      value={row.primary_provider}
                      onChange={(e) => {
                        const next = e.target.value as Provider;
                        setRows((prev) => prev.map((item, idx) => {
                          if (idx !== index) return item;
                          const fallback = item.fallback_provider === next ? '' : item.fallback_provider;
                          return { ...item, primary_provider: next, fallback_provider: fallback };
                        }));
                      }}
                      className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
                    >
                      {PROVIDERS.map((provider) => (
                        <option key={provider} value={provider}>{provider}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={row.fallback_provider}
                      onChange={(e) => {
                        const next = e.target.value as Provider | '';
                        setRows((prev) => prev.map((item, idx) => idx === index ? { ...item, fallback_provider: next } : item));
                      }}
                      className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
                    >
                      <option value="">none</option>
                      {PROVIDERS.filter((provider) => provider !== row.primary_provider).map((provider) => (
                        <option key={provider} value={provider}>{provider}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      value={row.throttle_per_min}
                      onChange={(e) => {
                        const next = Number(e.target.value || 1);
                        setRows((prev) => prev.map((item, idx) => idx === index ? { ...item, throttle_per_min: next } : item));
                      }}
                      className="w-28 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => void saveRouting()}
          disabled={saving || !tenantId}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Routing'}
        </button>
      </div>
    </div>
  );
}
