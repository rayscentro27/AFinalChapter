import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = { id: string; name: string | null };
type Role = {
  id: string;
  tenant_id: string;
  key: string;
  name: string;
  is_system: boolean;
  permissions: string[];
};
type Member = {
  tenant_id: string;
  user_id: string;
  role: string | null;
  role_id: string | null;
  role_key?: string | null;
};

const LEGACY_PERMISSIONS: Record<string, string[]> = {
  owner: ['*'],
  admin: ['roles.read', 'roles.write', 'members.read', 'members.write', 'policy.manage'],
  agent: ['roles.read', 'members.read'],
  viewer: ['roles.read', 'members.read'],
};

const ALL_PERMISSIONS = [
  'inbox.read', 'inbox.write',
  'contacts.read', 'contacts.write', 'contacts.merge',
  'routing.read', 'routing.manage',
  'channels.read', 'channels.manage',
  'outbox.read', 'outbox.run',
  'monitoring.read', 'monitoring.manage',
  'billing.read', 'billing.manage',
  'roles.read', 'roles.write',
  'members.read', 'members.write',
  'api_keys.manage', 'webhooks.manage',
  'audit.read', 'audit.export',
  'policy.manage',
  'attachments.upload', 'attachments.large',
  'messages.send',
];

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

export default function AdminRoles() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [userId, setUserId] = useState('');

  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [newKey, setNewKey] = useState('custom_role');
  const [newName, setNewName] = useState('Custom Role');
  const [newPermissions, setNewPermissions] = useState<string[]>(['roles.read']);

  const roleById = useMemo(() => {
    const out = new Map<string, Role>();
    for (const role of roles) out.set(role.id, role);
    return out;
  }, [roles]);

  const currentPermissions = useMemo(() => {
    const me = members.find((row) => row.user_id === userId);
    if (!me) return new Set<string>();

    if (me.role_id && roleById.has(me.role_id)) {
      return new Set((roleById.get(me.role_id)?.permissions || []).map((p) => String(p || '').toLowerCase()));
    }

    return new Set((LEGACY_PERMISSIONS[String(me.role || '').toLowerCase()] || []).map((p) => p.toLowerCase()));
  }, [members, roleById, userId]);

  const canWrite = currentPermissions.has('*') || currentPermissions.has('roles.write');
  const canRead = currentPermissions.has('*') || currentPermissions.has('roles.read') || canWrite;

  async function loadTenantData(nextTenantId = tenantId) {
    if (!nextTenantId) return;
    const token = await accessToken();

    const [rolesPayload, membersPayload] = await Promise.all([
      fetchJson(`/.netlify/functions/admin-roles?tenant_id=${encodeURIComponent(nextTenantId)}`, { method: 'GET' }, token),
      fetchJson(`/.netlify/functions/admin-members?tenant_id=${encodeURIComponent(nextTenantId)}`, { method: 'GET' }, token),
    ]);

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

        const uid = String(userRes?.user?.id || '');
        setUserId(uid);

        const list = (tenantRows || []) as Tenant[];
        setTenants(list);
        if (list.length > 0) {
          setTenantId(list[0].id);
        }
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
    void loadTenantData(tenantId).catch((e: any) => setError(String(e?.message || e)));
  }, [tenantId]);

  async function createRole() {
    if (!tenantId) return;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const token = await accessToken();
      await fetchJson('/.netlify/functions/admin-roles', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId,
          key: newKey,
          name: newName,
          permissions: newPermissions,
        }),
      }, token);

      setSuccess('Role created.');
      await loadTenantData(tenantId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function saveRole(role: Role) {
    if (!tenantId) return;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const token = await accessToken();
      await fetchJson('/.netlify/functions/admin-roles', {
        method: 'PUT',
        body: JSON.stringify({
          tenant_id: tenantId,
          role_id: role.id,
          key: role.key,
          name: role.name,
          permissions: role.permissions,
        }),
      }, token);

      setSuccess(`Saved ${role.name}.`);
      await loadTenantData(tenantId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteRole(role: Role) {
    if (!tenantId) return;
    if (!window.confirm(`Delete role ${role.name}?`)) return;

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const token = await accessToken();
      await fetchJson(`/.netlify/functions/admin-roles?tenant_id=${encodeURIComponent(tenantId)}&role_id=${encodeURIComponent(role.id)}`, {
        method: 'DELETE',
      }, token);

      setSuccess(`Deleted ${role.name}.`);
      await loadTenantData(tenantId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  function togglePermission(target: string, permission: string) {
    if (target === 'new') {
      setNewPermissions((prev) => {
        const has = prev.includes(permission);
        return has ? prev.filter((item) => item !== permission) : [...prev, permission];
      });
      return;
    }

    setRoles((prev) => prev.map((role) => {
      if (role.id !== target) return role;
      const has = role.permissions.includes(permission);
      return {
        ...role,
        permissions: has
          ? role.permissions.filter((item) => item !== permission)
          : [...role.permissions, permission],
      };
    }));
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-slate-300">Loading roles...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5 text-slate-100">
      <div>
        <h1 className="text-2xl font-semibold text-white">Role Manager</h1>
        <p className="text-slate-400 text-sm mt-1">Manage custom tenant roles and granular permissions.</p>
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

      {!canRead ? (
        <div className="rounded-md border border-amber-500/50 bg-amber-950/30 text-amber-200 text-sm px-4 py-3">
          You do not have permission to view roles for this tenant.
        </div>
      ) : null}

      {canRead ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
            <h2 className="text-white font-medium">Create Role</h2>

            <input className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm" value={newKey} onChange={(e) => setNewKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))} placeholder="role_key" disabled={!canWrite || busy} />
            <input className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Role name" disabled={!canWrite || busy} />

            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-auto border border-slate-700 rounded-md p-2">
              {ALL_PERMISSIONS.map((permission) => (
                <label key={permission} className="text-xs text-slate-300 flex items-center gap-2">
                  <input type="checkbox" checked={newPermissions.includes(permission)} onChange={() => togglePermission('new', permission)} disabled={!canWrite || busy} />
                  <span>{permission}</span>
                </label>
              ))}
            </div>

            <button className="rounded bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-2 disabled:opacity-50" disabled={!canWrite || busy || !newKey || !newName} onClick={() => void createRole()}>
              Create role
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
            <h2 className="text-white font-medium">Existing Roles</h2>
            <div className="space-y-4 max-h-[34rem] overflow-auto pr-1">
              {roles.map((role) => (
                <div key={role.id} className="rounded-lg border border-slate-700 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <input className="w-36 bg-slate-800 border border-slate-600 rounded-md px-2 py-1 text-xs" value={role.key} onChange={(e) => setRoles((prev) => prev.map((row) => row.id === role.id ? { ...row, key: e.target.value.toLowerCase() } : row))} disabled={!canWrite || busy || role.is_system} />
                    <input className="flex-1 bg-slate-800 border border-slate-600 rounded-md px-2 py-1 text-xs" value={role.name} onChange={(e) => setRoles((prev) => prev.map((row) => row.id === role.id ? { ...row, name: e.target.value } : row))} disabled={!canWrite || busy} />
                    {role.is_system ? <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/40 text-emerald-300">system</span> : null}
                  </div>

                  <div className="grid grid-cols-2 gap-1 max-h-40 overflow-auto border border-slate-700 rounded-md p-2">
                    {ALL_PERMISSIONS.map((permission) => (
                      <label key={`${role.id}:${permission}`} className="text-[11px] text-slate-300 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={role.permissions.includes(permission)}
                          onChange={() => togglePermission(role.id, permission)}
                          disabled={!canWrite || busy}
                        />
                        <span>{permission}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button className="rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 disabled:opacity-50" disabled={!canWrite || busy} onClick={() => void saveRole(role)}>Save</button>
                    <button className="rounded bg-rose-700 hover:bg-rose-600 text-white text-xs px-3 py-1.5 disabled:opacity-50" disabled={!canWrite || busy || role.is_system} onClick={() => void deleteRole(role)}>Delete</button>
                  </div>
                </div>
              ))}

              {roles.length === 0 ? <div className="text-sm text-slate-400">No roles found.</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
