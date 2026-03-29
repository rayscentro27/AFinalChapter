import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = { id: string; name: string | null };
type Role = { id: string; key: string; name: string; permissions: string[] };
type Member = {
  tenant_id: string;
  user_id: string;
  role: string | null;
  role_id: string | null;
  role_key?: string | null;
  role_name?: string | null;
};

const LEGACY_PERMISSIONS: Record<string, string[]> = {
  owner: ['*'],
  admin: ['members.read', 'members.write'],
  agent: ['members.read'],
  viewer: ['members.read'],
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

export default function AdminMembers() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [userId, setUserId] = useState('');

  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  async function loadData(nextTenantId = tenantId) {
    if (!nextTenantId) return;

    const token = await accessToken();
    const [rolePayload, memberPayload] = await Promise.all([
      fetchJson(`/.netlify/functions/admin-roles?tenant_id=${encodeURIComponent(nextTenantId)}`, { method: 'GET' }, token),
      fetchJson(`/.netlify/functions/admin-members?tenant_id=${encodeURIComponent(nextTenantId)}`, { method: 'GET' }, token),
    ]);

    setRoles(Array.isArray(rolePayload?.roles) ? rolePayload.roles : []);
    setMembers(Array.isArray(memberPayload?.members) ? memberPayload.members : []);
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
    const map = new Map<string, Role>();
    for (const role of roles) map.set(role.id, role);
    return map;
  }, [roles]);

  const currentPermissions = useMemo(() => {
    const me = members.find((m) => m.user_id === userId);
    if (!me) return new Set<string>();

    if (me.role_id && roleById.has(me.role_id)) {
      return new Set((roleById.get(me.role_id)?.permissions || []).map((p) => String(p || '').toLowerCase()));
    }

    return new Set((LEGACY_PERMISSIONS[String(me.role || '').toLowerCase()] || []).map((p) => p.toLowerCase()));
  }, [members, roleById, userId]);

  const canRead = currentPermissions.has('*') || currentPermissions.has('members.read') || currentPermissions.has('members.write');
  const canWrite = currentPermissions.has('*') || currentPermissions.has('members.write');

  async function updateMemberRole(member: Member, roleId: string) {
    if (!tenantId || !roleId) return;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const token = await accessToken();
      await fetchJson('/.netlify/functions/admin-member-role', {
        method: 'PUT',
        body: JSON.stringify({
          tenant_id: tenantId,
          user_id: member.user_id,
          role_id: roleId,
        }),
      }, token);

      setSuccess(`Updated ${member.user_id.slice(0, 8)} role.`);
      await loadData(tenantId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-slate-300">Loading members...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5 text-slate-100">
      <div>
        <h1 className="text-2xl font-semibold text-white">Tenant Members</h1>
        <p className="text-slate-400 text-sm mt-1">Assign role IDs to tenant members.</p>
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
          You do not have permission to view member assignments.
        </div>
      ) : null}

      {canRead ? (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Legacy Role</th>
                  <th className="px-4 py-3 text-left">Role ID</th>
                  <th className="px-4 py-3 text-left">Role Name</th>
                  <th className="px-4 py-3 text-left">Assign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {members.map((member) => (
                  <tr key={member.user_id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">{member.user_id}</td>
                    <td className="px-4 py-3 text-slate-300">{member.role || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{member.role_id || '-'}</td>
                    <td className="px-4 py-3 text-slate-300">{member.role_name || member.role_key || '-'}</td>
                    <td className="px-4 py-3">
                      <select
                        className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs"
                        value={member.role_id || ''}
                        disabled={!canWrite || busy}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (!next) return;
                          void updateMemberRole(member, next);
                        }}
                      >
                        <option value="" disabled>Select role</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name} ({role.key})</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
