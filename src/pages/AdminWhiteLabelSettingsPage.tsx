import React, { useEffect, useMemo, useState } from 'react';
import { Palette, Globe, Layers3, Mail, Save } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

type Organization = { id: string; org_name: string };
type BrandingRecord = {
  org_id: string;
  brand_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  domain: string | null;
  support_email: string | null;
  telegram_handle: string | null;
};
type ModuleRecord = {
  org_id: string;
  module_name: string;
  enabled: boolean | null;
  config: Record<string, unknown> | null;
};

const DEFAULT_MODULES = [
  'portal',
  'voice_sales',
  'ads',
  'public_api',
  'compliance',
  'grants',
  'funding',
];

export default function AdminWhiteLabelSettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [modules, setModules] = useState<ModuleRecord[]>([]);
  const [orgId, setOrgId] = useState('');
  const [form, setForm] = useState<BrandingRecord>({
    org_id: '',
    brand_name: '',
    logo_url: '',
    primary_color: '#1a1a2e',
    secondary_color: '#16213e',
    domain: '',
    support_email: '',
    telegram_handle: '',
  });

  useEffect(() => {
    let active = true;

    async function load() {
      if (!isAdmin) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const orgRes = await supabase.from('organizations').select('id,org_name').order('org_name', { ascending: true });
        if (orgRes.error) throw orgRes.error;
        if (!active) return;

        const orgRows = (orgRes.data || []) as Organization[];
        setOrganizations(orgRows);
        setOrgId((current) => current || orgRows[0]?.id || '');
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
  }, [isAdmin]);

  useEffect(() => {
    if (!orgId) return;

    let active = true;

    async function loadOrgConfig() {
      setError('');
      setSuccess('');
      try {
        const [brandingRes, moduleRes] = await Promise.all([
          supabase.from('branding_configs').select('org_id,brand_name,logo_url,primary_color,secondary_color,domain,support_email,telegram_handle').eq('org_id', orgId).maybeSingle(),
          supabase.from('org_module_configs').select('org_id,module_name,enabled,config').eq('org_id', orgId).order('module_name', { ascending: true }),
        ]);

        if (brandingRes.error) throw brandingRes.error;
        if (moduleRes.error) throw moduleRes.error;
        if (!active) return;

        const branding = brandingRes.data as BrandingRecord | null;
        setForm({
          org_id: orgId,
          brand_name: branding?.brand_name || organizations.find((item) => item.id === orgId)?.org_name || '',
          logo_url: branding?.logo_url || '',
          primary_color: branding?.primary_color || '#1a1a2e',
          secondary_color: branding?.secondary_color || '#16213e',
          domain: branding?.domain || '',
          support_email: branding?.support_email || '',
          telegram_handle: branding?.telegram_handle || '',
        });
        setModules((moduleRes.data || []) as ModuleRecord[]);
      } catch (e: any) {
        if (active) setError(String(e?.message || e));
      }
    }

    void loadOrgConfig();
    return () => {
      active = false;
    };
  }, [orgId, organizations]);

  const renderedModules = useMemo(() => {
    const byName = new Map(modules.map((item) => [item.module_name, item]));
    return DEFAULT_MODULES.map((moduleName) => byName.get(moduleName) || {
      org_id: orgId,
      module_name: moduleName,
      enabled: moduleName !== 'public_api',
      config: {},
    });
  }, [modules, orgId]);

  async function handleSave() {
    if (!orgId) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const brandingPayload = {
        org_id: orgId,
        brand_name: form.brand_name || null,
        logo_url: form.logo_url || null,
        primary_color: form.primary_color || '#1a1a2e',
        secondary_color: form.secondary_color || '#16213e',
        domain: form.domain || null,
        support_email: form.support_email || null,
        telegram_handle: form.telegram_handle || null,
        updated_at: new Date().toISOString(),
      };

      const brandingRes = await supabase.from('branding_configs').upsert(brandingPayload, { onConflict: 'org_id' });
      if (brandingRes.error) throw brandingRes.error;

      if (renderedModules.length > 0) {
        const modulePayload = renderedModules.map((item) => ({
          org_id: orgId,
          module_name: item.module_name,
          enabled: item.enabled !== false,
          config: item.config || {},
          updated_at: new Date().toISOString(),
        }));

        const moduleRes = await supabase.from('org_module_configs').upsert(modulePayload, { onConflict: 'org_id,module_name' });
        if (moduleRes.error) throw moduleRes.error;
      }

      setSuccess('White-label settings saved.');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  function updateModule(moduleName: string, enabled: boolean) {
    setModules((current) => {
      const existing = current.find((item) => item.module_name === moduleName);
      if (existing) {
        return current.map((item) => item.module_name === moduleName ? { ...item, enabled } : item);
      }

      return current.concat({
        org_id: orgId,
        module_name: moduleName,
        enabled,
        config: {},
      });
    });
  }

  if (!isAdmin) {
    return <div className="mx-auto max-w-4xl px-4 py-8 text-slate-100"><div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Internal admin access required.</div></div>;
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading white-label settings...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 text-slate-100 space-y-6">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#fdf2f8_42%,#f8fafc_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">White-Label Settings</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Brand, domain, and module controls</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Configure organization-level branding, support endpoints, domains, and exposed modules for the multi-tenant platform.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-xs uppercase tracking-[0.22em] text-slate-400 mb-2">Organization</label>
        <select className="w-full md:w-[24rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={orgId} onChange={(event) => setOrgId(event.target.value)}>
          {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.org_name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Brand Package</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">Identity and support profile</h2>
          </div>

          <Field label="Brand Name" icon={Palette}>
            <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" value={form.brand_name || ''} onChange={(event) => setForm((current) => ({ ...current, brand_name: event.target.value }))} />
          </Field>
          <Field label="Logo URL" icon={Palette}>
            <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" value={form.logo_url || ''} onChange={(event) => setForm((current) => ({ ...current, logo_url: event.target.value }))} placeholder="https://..." />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Primary Color" icon={Palette}>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" value={form.primary_color || ''} onChange={(event) => setForm((current) => ({ ...current, primary_color: event.target.value }))} />
            </Field>
            <Field label="Secondary Color" icon={Palette}>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" value={form.secondary_color || ''} onChange={(event) => setForm((current) => ({ ...current, secondary_color: event.target.value }))} />
            </Field>
          </div>
          <Field label="Domain" icon={Globe}>
            <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" value={form.domain || ''} onChange={(event) => setForm((current) => ({ ...current, domain: event.target.value }))} placeholder="portal.example.com" />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Support Email" icon={Mail}>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" value={form.support_email || ''} onChange={(event) => setForm((current) => ({ ...current, support_email: event.target.value }))} placeholder="support@example.com" />
            </Field>
            <Field label="Telegram Handle" icon={Globe}>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" value={form.telegram_handle || ''} onChange={(event) => setForm((current) => ({ ...current, telegram_handle: event.target.value }))} placeholder="@handle" />
            </Field>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Module Exposure</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">Enable or hide tenant modules</h2>
          </div>
          <div className="space-y-3">
            {renderedModules.map((item) => (
              <div key={item.module_name} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{humanizeModule(item.module_name)}</div>
                  <div className="text-xs text-slate-500">Organization-level switch for this experience area</div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateModule(item.module_name, event.target.checked)} />
                  Enabled
                </label>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-3 text-slate-900 font-semibold"><Layers3 size={18} /> Live preview</div>
            <div className="mt-4 rounded-[1.5rem] border border-slate-200 p-5" style={{ background: `linear-gradient(135deg, ${form.primary_color || '#1a1a2e'} 0%, ${form.secondary_color || '#16213e'} 100%)` }}>
              <div className="text-white text-[10px] font-black uppercase tracking-[0.22em]">Portal Preview</div>
              <div className="mt-3 text-2xl font-semibold text-white">{form.brand_name || 'Untitled Brand'}</div>
              <div className="mt-2 text-sm text-white/80">{form.domain || 'your-domain.example.com'}</div>
              <div className="mt-4 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">{renderedModules.filter((item) => item.enabled !== false).length} modules enabled</div>
            </div>
          </div>
        </section>
      </div>

      <div className="flex justify-end">
        <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void handleSave()} disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving...' : 'Save White-Label Config'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400"><Icon size={14} /> {label}</div>
      {children}
    </label>
  );
}

function humanizeModule(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}