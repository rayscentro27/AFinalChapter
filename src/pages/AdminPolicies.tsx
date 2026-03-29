import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = { id: string; name: string | null };
type Policy = {
  id: string;
  tenant_id: string;
  is_active: boolean;
  priority: number;
  effect: 'allow' | 'deny';
  action: string;
  conditions: Record<string, any>;
  created_at: string;
};
type Role = { id: string; permissions: string[] };
type Member = { user_id: string; role: string | null; role_id: string | null };

const LEGACY_POLICY_PERMISSIONS: Record<string, string[]> = {
  owner: ['*'],
  admin: ['policy.manage'],
};

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in required');
  return token;
}

async function fetchJson(url: string, init: RequestInit, token: string) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.ok === false) {
    throw new Error(String(payload?.error || `Request failed (${res.status})`));
  }
  return payload;
}

export default function AdminPolicies() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [userId, setUserId] = useState('');

  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);

  const [draftAction, setDraftAction] = useState('messages.send');
  const [draftEffect, setDraftEffect] = useState<'allow' | 'deny'>('deny');
  const [draftPriority, setDraftPriority] = useState(100);
  const [draftConditions, setDraftConditions] = useState('{"providers_blocked":[]}');

  async function loadData(nextTenantId = tenantId) {
    if (!nextTenantId) return;

    const token = await accessToken();
    const [policiesPayload, rolesPayload, membersPayload] = await Promise.all([
      fetchJson(`/.netlify/functions/admin-policies?tenant_id=${encodeURIComponent(nextTenantId)}`, { method: 'GET' }, token),
      fetchJson(`/.netlify/functions/admin-roles?tenant_id=${encodeURIComponent(nextTenantId)}`, { method: 'GET' }, token),
      fetchJson(`/.netlify/functions/admin-members?tenant_id=${encodeURIComponent(nextTenantId)}`, { method: 'GET' }, token),
    ]);

    setPolicies(Array.isArray(policiesPayload?.policies) ? policiesPayload.policies : []);
    setRoles(Array.isArray(rolesPayload?.roles) ? rolesPayload.roles : []);
    setMembers(Array.isArray(membersPayload?.members) ? membersPayload.members : []);
  }

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      setError('');

      try {
        const [{ data: userRes, error: userErr }, { data: tenantRows, error: tenantErr }] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from('tenants').select('id,name').order('name', { ascending: true }),
        ]);

        if (userErr) throw userErr;
        if (tenantErr) throw tenantErr;
        if (!active) return;

        setUserId(String(userRes?.user?.id || ''));
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
    void loadData(tenantId).catch((e: any) => setError(String(e?.message || e)));
  }, [tenantId]);

  const roleById = useMemo(() => {
    const out = new Map<string, Role>();
    for (const role of roles) out.set(role.id, role);
    return out;
  }, [roles]);

  const canManagePolicy = useMemo(() => {
    const me = members.find((row) => row.user_id === userId);
    if (!me) return false;

    if (me.role_id && roleById.has(me.role_id)) {
      const p = new Set((roleById.get(me.role_id)?.permissions || []).map((item) => String(item || '').toLowerCase()));
      return p.has('*') || p.has('policy.manage');
    }

    const p = new Set((LEGACY_POLICY_PERMISSIONS[String(me.role || '').toLowerCase()] || []).map((item) => item.toLowerCase()));
    return p.has('*') || p.has('policy.manage');
  }, [members, roleById, userId]);

  async function createPolicy() {
    if (!tenantId) return;

    let parsedConditions: Record<string, any> = {};
    try {
      parsedConditions = JSON.parse(draftConditions || '{}');
    } catch {
      setError('Conditions must be valid JSON.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const token = await accessToken();
      await fetchJson('/.netlify/functions/admin-policies', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId,
          action: draftAction,
          effect: draftEffect,
          priority: Number(draftPriority || 100),
          conditions: parsedConditions,
          is_active: true,
        }),
      }, token);

      setSuccess('Policy created.');
      await loadData(tenantId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function togglePolicy(policy: Policy) {
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const token = await accessToken();
      await fetchJson('/.netlify/functions/admin-policies', {
        method: 'PUT',
        body: JSON.stringify({
          tenant_id: tenantId,
          id: policy.id,
          is_active: !policy.is_active,
        }),
      }, token);
      setSuccess('Policy updated.');
      await loadData(tenantId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function deletePolicy(policy: Policy) {
    if (!window.confirm(`Delete policy ${policy.action} (${policy.effect})?`)) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const token = await accessToken();
      await fetchJson(`/.netlify/functions/admin-policies?tenant_id=${encodeURIComponent(tenantId)}&id=${encodeURIComponent(policy.id)}`, {
        method: 'DELETE',
      }, token);
      setSuccess('Policy deleted.');
      await loadData(tenantId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-slate-300">Loading policies...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5 text-slate-100">
      <div>
        <h1 className="text-2xl font-semibold text-white">Policy Engine</h1>
        <p className="text-slate-400 text-sm mt-1">Create allow/deny policies for actions like sends, uploads, merges, and runners.</p>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
        <label className="block text-xs uppercase tracking-wide text-slate-400 mb-2">Tenant</label>
        <select className="w-full md:w-96 bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
          ))}
        </select>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      {!canManagePolicy ? (
        <div className="rounded-md border border-amber-500/50 bg-amber-950/30 text-amber-200 text-sm px-4 py-3">
          You do not have permission to manage policies.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
          <h2 className="text-white font-medium">Create Policy</h2>

          <input className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm" value={draftAction} onChange={(e) => setDraftAction(e.target.value)} placeholder="messages.send" disabled={!canManagePolicy || busy} />

          <div className="grid grid-cols-2 gap-2">
            <select className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm" value={draftEffect} onChange={(e) => setDraftEffect(e.target.value as 'allow' | 'deny')} disabled={!canManagePolicy || busy}>
              <option value="deny">deny</option>
              <option value="allow">allow</option>
            </select>

            <input type="number" className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm" value={draftPriority} onChange={(e) => setDraftPriority(Number(e.target.value || 100))} disabled={!canManagePolicy || busy} />
          </div>

          <textarea className="w-full min-h-[180px] bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm font-mono" value={draftConditions} onChange={(e) => setDraftConditions(e.target.value)} disabled={!canManagePolicy || busy} />

          <button className="rounded bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-2 disabled:opacity-50" disabled={!canManagePolicy || busy || !draftAction} onClick={() => void createPolicy()}>
            Create policy
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
          <h2 className="text-white font-medium">Policies</h2>
          <div className="space-y-3 max-h-[34rem] overflow-auto">
            {policies.map((policy) => (
              <div key={policy.id} className="rounded-lg border border-slate-700 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-slate-100">
                    <span className="font-semibold">{policy.action}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full border ${policy.effect === 'deny' ? 'border-rose-500/50 text-rose-300' : 'border-emerald-500/50 text-emerald-300'}`}>
                      {policy.effect}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">priority {policy.priority}</div>
                </div>

                <pre className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded p-2 overflow-auto">{JSON.stringify(policy.conditions || {}, null, 2)}</pre>

                <div className="flex gap-2">
                  <button className="rounded bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 disabled:opacity-50" disabled={!canManagePolicy || busy} onClick={() => void togglePolicy(policy)}>
                    {policy.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button className="rounded bg-rose-700 hover:bg-rose-600 text-white text-xs px-3 py-1.5 disabled:opacity-50" disabled={!canManagePolicy || busy} onClick={() => void deletePolicy(policy)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {policies.length === 0 ? <div className="text-sm text-slate-400">No policies found.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
