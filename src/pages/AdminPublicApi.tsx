import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = { id: string; name: string };
type ApiKeyRow = { id: string; name: string; scopes: string[]; is_active: boolean; created_at: string };
type WebhookRow = { id: string; url: string; events: string[]; is_active: boolean; created_at: string };

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const t = data?.session?.access_token;
  if (!t) throw new Error('Sign in required');
  return t;
}

async function fetchJson(url: string, init: RequestInit, accessToken: string) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(String(payload?.error || `Request failed (${response.status})`));
  }
  return payload;
}

export default function AdminPublicApi() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');

  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);

  const [newKeyName, setNewKeyName] = useState('Client Integration');
  const [newKeyScopes, setNewKeyScopes] = useState('read,write');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookSecret, setNewWebhookSecret] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState('message.created,message.status,contact.updated');

  async function reload(currentTenantId = tenantId) {
    if (!currentTenantId) return;
    const access = await token();

    const [keyPayload, webhookPayload] = await Promise.all([
      fetchJson(`/.netlify/functions/admin-public-api-keys?tenant_id=${encodeURIComponent(currentTenantId)}`, { method: 'GET' }, access),
      fetchJson(`/.netlify/functions/admin-public-webhooks?tenant_id=${encodeURIComponent(currentTenantId)}`, { method: 'GET' }, access),
    ]);

    setApiKeys(Array.isArray(keyPayload?.keys) ? keyPayload.keys : []);
    setWebhooks(Array.isArray(webhookPayload?.subscriptions) ? webhookPayload.subscriptions : []);
  }

  useEffect(() => {
    let active = true;
    async function boot() {
      setLoading(true);
      setError('');

      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!userData?.user?.id) throw new Error('Not signed in');

        const { data: tenantRows, error: tenantErr } = await supabase
          .from('tenants')
          .select('id,name')
          .order('name', { ascending: true });

        if (tenantErr) throw tenantErr;
        if (!active) return;

        const list = (tenantRows || []) as Tenant[];
        setTenants(list);
        if (list.length > 0) setTenantId(list[0].id);
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
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void reload(tenantId).catch((e) => setError(String(e?.message || e)));
  }, [tenantId]);

  async function createApiKey() {
    if (!tenantId) return;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const access = await token();
      const scopes = newKeyScopes.split(',').map((s) => s.trim()).filter(Boolean);

      const payload = await fetchJson('/.netlify/functions/admin-public-api-keys', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, name: newKeyName, scopes }),
      }, access);

      const rawKey = String(payload?.raw_key || '');
      setSuccess(rawKey ? `API key created. Copy now: ${rawKey}` : 'API key created.');
      await reload();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function revokeApiKey(id: string) {
    if (!tenantId || !id) return;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const access = await token();
      await fetchJson('/.netlify/functions/admin-public-api-keys-revoke', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, key_id: id }),
      }, access);

      setSuccess('API key revoked.');
      await reload();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function createWebhook() {
    if (!tenantId) return;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const access = await token();
      const events = newWebhookEvents.split(',').map((s) => s.trim()).filter(Boolean);

      await fetchJson('/.netlify/functions/admin-public-webhooks', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, url: newWebhookUrl, secret: newWebhookSecret, events }),
      }, access);

      setSuccess('Webhook subscription created.');
      setNewWebhookUrl('');
      setNewWebhookSecret('');
      await reload();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function revokeWebhook(id: string) {
    if (!tenantId || !id) return;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const access = await token();
      await fetchJson('/.netlify/functions/admin-public-webhooks-revoke', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, id }),
      }, access);

      setSuccess('Webhook revoked.');
      await reload();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function testWebhook(id: string) {
    if (!tenantId || !id) return;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const access = await token();
      await fetchJson('/.netlify/functions/admin-public-webhooks-test', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, id }),
      }, access);

      await fetchJson('/.netlify/functions/admin-public-webhooks-run', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, limit: 25 }),
      }, access);

      setSuccess('Webhook test queued and dispatcher run triggered.');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-slate-300">Loading public API settings...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Public API & Webhooks</h1>
        <p className="text-slate-400 text-sm mt-1">Manage tenant API keys and outgoing webhook subscriptions.</p>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
        <label className="block text-xs uppercase tracking-wide text-slate-400 mb-2">Tenant</label>
        <select className="w-full md:w-96 bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
          ))}
        </select>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3 break-all">{success}</div> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
          <h2 className="text-white font-medium">API Keys</h2>

          <div className="grid gap-2">
            <input className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Key name" />
            <input className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100" value={newKeyScopes} onChange={(e) => setNewKeyScopes(e.target.value)} placeholder="Scopes: read,write" />
            <button className="rounded bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-2 disabled:opacity-50" disabled={busy || !tenantId} onClick={() => void createApiKey()}>Create key</button>
          </div>

          <div className="divide-y divide-slate-800">
            {apiKeys.length === 0 ? <div className="text-sm text-slate-400 py-2">No keys yet.</div> : apiKeys.map((row) => (
              <div key={row.id} className="py-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-200">{row.name}</div>
                  <div className="text-xs text-slate-400">{(row.scopes || []).join(', ') || 'read,write'} • {row.is_active ? 'active' : 'revoked'}</div>
                </div>
                <button className="rounded bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 disabled:opacity-50" disabled={busy || !row.is_active} onClick={() => void revokeApiKey(row.id)}>Revoke</button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
          <h2 className="text-white font-medium">Webhook Subscriptions</h2>

          <div className="grid gap-2">
            <input className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100" value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} placeholder="https://example.com/webhook" />
            <input className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100" value={newWebhookSecret} onChange={(e) => setNewWebhookSecret(e.target.value)} placeholder="Webhook shared secret" />
            <input className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100" value={newWebhookEvents} onChange={(e) => setNewWebhookEvents(e.target.value)} placeholder="message.created,message.status,contact.updated" />
            <button className="rounded bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-2 disabled:opacity-50" disabled={busy || !tenantId} onClick={() => void createWebhook()}>Add webhook</button>
          </div>

          <div className="divide-y divide-slate-800">
            {webhooks.length === 0 ? <div className="text-sm text-slate-400 py-2">No webhooks yet.</div> : webhooks.map((row) => (
              <div key={row.id} className="py-2 space-y-1">
                <div className="text-sm text-slate-200 break-all">{row.url}</div>
                <div className="text-xs text-slate-400">{(row.events || []).join(', ') || '*'} • {row.is_active ? 'active' : 'revoked'}</div>
                <div className="flex gap-2">
                  <button className="rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 disabled:opacity-50" disabled={busy || !row.is_active} onClick={() => void testWebhook(row.id)}>Test</button>
                  <button className="rounded bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 disabled:opacity-50" disabled={busy || !row.is_active} onClick={() => void revokeWebhook(row.id)}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
