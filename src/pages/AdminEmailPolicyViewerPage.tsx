import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

type EmailAliasRule = {
  id: string;
  tenant_id: string | null;
  alias_email: string;
  destination_email: string;
  category: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type EmailTemplate = {
  id: string;
  tenant_id: string | null;
  template_key: string;
  template_name: string;
  category: string;
  subject_template: string;
  body_template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type EmailPolicy = {
  id: string;
  tenant_id: string | null;
  policy_key: string;
  policy_value_json: Record<string, unknown>;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type EmailPolicyFilters = {
  tenant_id: string | null;
  alias_email: string | null;
  category: string | null;
  template_key: string | null;
  policy_key: string | null;
  include_inactive: boolean;
};

type EmailPolicyResponse = {
  ok: boolean;
  filters: EmailPolicyFilters;
  aliases: EmailAliasRule[];
  templates: EmailTemplate[];
  policies: EmailPolicy[];
  error?: string;
};

const BASE = '/.netlify/functions/email-policy';

export default function AdminEmailPolicyViewerPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<EmailPolicyResponse | null>(null);

  const [aliasEmail, setAliasEmail] = useState('');
  const [category, setCategory] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [policyKey, setPolicyKey] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (aliasEmail.trim()) params.set('alias_email', aliasEmail.trim());
    if (category.trim()) params.set('category', category.trim());
    if (templateKey.trim()) params.set('template_key', templateKey.trim());
    if (policyKey.trim()) params.set('policy_key', policyKey.trim());
    if (tenantId.trim()) params.set('tenant_id', tenantId.trim());
    if (includeInactive) params.set('include_inactive', '1');
    return params.toString();
  }, [aliasEmail, category, templateKey, policyKey, tenantId, includeInactive]);

  const fetchPolicy = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const session = await supabase.auth.getSession();
      const token = String(session.data.session?.access_token || '').trim();
      if (!token) {
        throw new Error('Missing session token. Please sign in again.');
      }

      const url = queryString ? `${BASE}?${queryString}` : BASE;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = (await response.json()) as EmailPolicyResponse;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Request failed (${response.status})`);
      }

      setData(payload);
    } catch (e: any) {
      setData(null);
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    void fetchPolicy();
  }, [isSuperAdmin, fetchPolicy]);

  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Super admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading email policy...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Email Policy Inspector</h1>
        <p className="text-sm text-slate-400 mt-1">Read-only view of Phase 1 email aliases, templates, and policies.</p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Alias Email</label>
          <input
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={aliasEmail}
            onChange={(e) => setAliasEmail(e.target.value)}
            placeholder="hello@goclearonline.cc"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Category</label>
          <input
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="lead_inquiry"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Template Key</label>
          <input
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={templateKey}
            onChange={(e) => setTemplateKey(e.target.value)}
            placeholder="daily_founder_summary"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Policy Key</label>
          <input
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={policyKey}
            onChange={(e) => setPolicyKey(e.target.value)}
            placeholder="email_phase"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Tenant ID</label>
          <input
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="tenant uuid"
          />
        </div>
        <div className="flex flex-col justify-between">
          <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Include Inactive</label>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800"
            />
            <button
              className="ml-auto rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:bg-cyan-500"
              onClick={() => void fetchPolicy()}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs text-slate-300">
        <div className="uppercase tracking-widest text-slate-400">Active Filters</div>
        <pre className="mt-2 whitespace-pre-wrap text-[11px] text-slate-200">{JSON.stringify(data?.filters || {}, null, 2)}</pre>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-200">Aliases</h2>
            <span className="text-xs text-slate-400">{data?.aliases?.length || 0} rows</span>
          </div>
          {data?.aliases?.length ? (
            <div className="mt-3 space-y-3">
              {data.aliases.map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-xs">
                  <div className="font-semibold text-slate-100">{row.alias_email}</div>
                  <div className="text-slate-400">{row.destination_email}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-slate-400">
                    <span>{row.category}</span>
                    <span>{row.is_active ? 'active' : 'inactive'}</span>
                  </div>
                  {row.notes ? <div className="mt-2 text-slate-500">{row.notes}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-400">No aliases match the current filters.</div>
          )}
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-200">Templates</h2>
            <span className="text-xs text-slate-400">{data?.templates?.length || 0} rows</span>
          </div>
          {data?.templates?.length ? (
            <div className="mt-3 space-y-3">
              {data.templates.map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-xs">
                  <div className="font-semibold text-slate-100">{row.template_key}</div>
                  <div className="text-slate-400">{row.template_name}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-slate-400">
                    <span>{row.category}</span>
                    <span>{row.is_active ? 'active' : 'inactive'}</span>
                  </div>
                  <div className="mt-2 text-slate-500">{row.subject_template}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-400">No templates match the current filters.</div>
          )}
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-200">Policies</h2>
            <span className="text-xs text-slate-400">{data?.policies?.length || 0} rows</span>
          </div>
          {data?.policies?.length ? (
            <div className="mt-3 space-y-3">
              {data.policies.map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-xs">
                  <div className="font-semibold text-slate-100">{row.policy_key}</div>
                  {row.description ? <div className="text-slate-400">{row.description}</div> : null}
                  <pre className="mt-2 whitespace-pre-wrap text-[11px] text-slate-300">{JSON.stringify(row.policy_value_json, null, 2)}</pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-400">No policies match the current filters.</div>
          )}
        </section>
      </div>
    </div>
  );
}
