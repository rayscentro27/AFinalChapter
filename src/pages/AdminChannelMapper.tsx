import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type ChannelProvider = 'twilio' | 'whatsapp' | 'meta' | 'matrix' | 'google_voice';
type MetaObject = 'page' | 'instagram';

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

type ChannelAccountRow = {
  id: string;
  tenant_id: string;
  provider: ChannelProvider;
  external_account_id: string;
  display_name: string | null;
  metadata: Record<string, unknown> | null;
  is_active: boolean;
  created_at?: string;
};

const PROVIDERS: ChannelProvider[] = ['twilio', 'whatsapp', 'meta', 'matrix', 'google_voice'];

const helperTextByProvider: Record<ChannelProvider, string> = {
  twilio: "Twilio: external_account_id is your Twilio inbound 'To' number in E.164 (example: +15551234567).",
  whatsapp: 'WhatsApp Cloud: external_account_id is phone_number_id (Meta), not E.164.',
  meta: 'Meta: external_account_id is Page ID (Messenger) or IG business/user ID (Instagram DMs).',
  matrix: 'Matrix: external_account_id is your bot user ID or routing key (example: @nexusbot:server).',
  google_voice: 'Google Voice: define your routing key for later bridge support.',
};

function parseMeta(input: string): Record<string, unknown> {
  if (!input.trim()) return {};
  const parsed = JSON.parse(input);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Metadata must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function readMetaObject(metadata: Record<string, unknown> | null | undefined): MetaObject {
  const value = String(metadata?.meta_object || '').trim().toLowerCase();
  return value === 'instagram' ? 'instagram' : 'page';
}

export default function AdminChannelMapper() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [rows, setRows] = useState<ChannelAccountRow[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ChannelProvider>('twilio');
  const [externalAccountId, setExternalAccountId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [metadataText, setMetadataText] = useState('{}');
  const [metaObject, setMetaObject] = useState<MetaObject>('page');

  const canSubmit = useMemo(
    () => !!tenantId && !!provider && externalAccountId.trim().length > 0,
    [tenantId, provider, externalAccountId]
  );

  const helperText = useMemo(() => helperTextByProvider[provider], [provider]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      setLoading(true);
      setError('');

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in.');

        const { data: tData, error: tErr } = await supabase
          .from('tenants')
          .select('id,name,created_at')
          .order('created_at', { ascending: false });

        if (tErr) throw tErr;

        if (!mounted) return;

        const nextTenants = (tData || []) as Tenant[];
        setTenants(nextTenants);
        if (nextTenants.length > 0) {
          setTenantId(nextTenants[0].id);
        }
      } catch (e: any) {
        if (mounted) setError(String(e?.message || e));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    boot();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void refresh(tenantId);
  }, [tenantId]);

  async function refresh(currentTenantId = tenantId) {
    setError('');

    const { data, error: qErr } = await supabase
      .from('channel_accounts')
      .select('id,tenant_id,provider,external_account_id,display_name,metadata,is_active,created_at')
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false });

    if (qErr) {
      setError(qErr.message);
      return;
    }

    setRows((data || []) as ChannelAccountRow[]);
  }

  function resetForm() {
    setEditingId(null);
    setProvider('twilio');
    setExternalAccountId('');
    setDisplayName('');
    setIsActive(true);
    setMetadataText('{}');
    setMetaObject('page');
  }

  function startEdit(row: ChannelAccountRow) {
    setEditingId(row.id);
    setProvider(row.provider);
    setExternalAccountId(row.external_account_id);
    setDisplayName(row.display_name || '');
    setIsActive(Boolean(row.is_active));
    setMetadataText(JSON.stringify(row.metadata || {}, null, 2));
    setMetaObject(readMetaObject(row.metadata));
  }

  async function save() {
    if (!canSubmit) return;

    setSaving(true);
    setError('');

    try {
      const metadata = parseMeta(metadataText);
      if (provider === 'meta') {
        metadata.meta_object = metaObject;
      }

      const payload = {
        tenant_id: tenantId,
        provider,
        external_account_id: externalAccountId.trim(),
        display_name: displayName.trim() || null,
        is_active: isActive,
        metadata,
      };

      if (editingId) {
        const { error: uErr } = await supabase
          .from('channel_accounts')
          .update(payload)
          .eq('id', editingId)
          .eq('tenant_id', tenantId);
        if (uErr) throw uErr;
      } else {
        const { error: iErr } = await supabase
          .from('channel_accounts')
          .insert(payload);
        if (iErr) throw iErr;
      }

      await refresh();
      resetForm();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: ChannelAccountRow) {
    setError('');

    const { error: uErr } = await supabase
      .from('channel_accounts')
      .update({ is_active: !row.is_active })
      .eq('id', row.id)
      .eq('tenant_id', tenantId);

    if (uErr) {
      setError(uErr.message);
      return;
    }

    await refresh();
  }

  async function removeRow(row: ChannelAccountRow) {
    const confirmed = window.confirm(`Delete mapping "${row.display_name || row.external_account_id}"? This cannot be undone.`);
    if (!confirmed) return;

    setError('');

    const { error: dErr } = await supabase
      .from('channel_accounts')
      .delete()
      .eq('id', row.id)
      .eq('tenant_id', tenantId);

    if (dErr) {
      setError(dErr.message);
      return;
    }

    await refresh();
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading channel mappings...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Channel Account Mapper</h1>
        <p className="text-sm text-slate-400 mt-2">
          Map provider account identifiers to tenant UUIDs so inbound webhooks route to the correct tenant.
        </p>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm font-medium">
          {error}
        </div>
      ) : null}

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ChannelProvider)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">External Account ID</label>
            <input
              value={externalAccountId}
              onChange={(e) => setExternalAccountId(e.target.value)}
              placeholder="+15551234567 or phone_number_id or page_id"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Twilio SMS Main"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
          </div>

          {provider === 'meta' ? (
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Meta Object</label>
              <select
                value={metaObject}
                onChange={(e) => setMetaObject(e.target.value as MetaObject)}
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
              >
                <option value="page">page (Messenger)</option>
                <option value="instagram">instagram</option>
              </select>
            </div>
          ) : null}
        </div>

        <div className="text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
          {helperText}
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Metadata (JSON)</label>
          <textarea
            value={metadataText}
            onChange={(e) => setMetadataText(e.target.value)}
            rows={5}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 font-mono text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-300">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-white/20 bg-black/20"
            />
            Active
          </label>

          <button
            onClick={save}
            disabled={!canSubmit || saving}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest"
          >
            {saving ? 'Saving...' : editingId ? 'Update Mapping' : 'Create Mapping'}
          </button>

          {editingId ? (
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase tracking-widest"
            >
              Cancel
            </button>
          ) : null}

          <button
            onClick={() => refresh()}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase tracking-widest"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 text-sm font-black uppercase tracking-widest text-slate-300">
          Mappings
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/20 text-slate-300">
              <tr>
                <th className="text-left px-4 py-3">Provider</th>
                <th className="text-left px-4 py-3">External Account ID</th>
                <th className="text-left px-4 py-3">Meta Object</th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Active</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-slate-400">No channel mappings for this tenant yet.</td>
                </tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="border-t border-white/5">
                  <td className="px-4 py-3">{row.provider}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-200">{row.external_account_id}</td>
                  <td className="px-4 py-3">{row.provider === 'meta' ? readMetaObject(row.metadata) : <span className="text-slate-500">-</span>}</td>
                  <td className="px-4 py-3">{row.display_name || <span className="text-slate-500">(no name)</span>}</td>
                  <td className="px-4 py-3">{row.is_active ? 'true' : 'false'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => startEdit(row)}
                        className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-black uppercase tracking-widest"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(row)}
                        className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-xs font-black uppercase tracking-widest"
                      >
                        {row.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => removeRow(row)}
                        className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-100 text-xs font-black uppercase tracking-widest"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
