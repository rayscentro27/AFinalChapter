import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const ROLES = ['owner', 'admin', 'supervisor', 'sales', 'agent', 'member', 'viewer', 'client'] as const;
type MemberRole = (typeof ROLES)[number];

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

type TenantMembershipRow = {
  tenant_id: string;
  user_id: string;
  role: string;
  created_at?: string;
};

type ProfileRow = {
  user_id: string;
  display_name?: string | null;
  full_name?: string | null;
  email?: string | null;
};

type TeamMemberRow = TenantMembershipRow & {
  display_name: string | null;
  email: string | null;
};

function isMissingColumnError(err: unknown, column: string): boolean {
  const msg = String((err as any)?.message || '').toLowerCase();
  return msg.includes(column.toLowerCase()) || msg.includes('column') || msg.includes('does not exist');
}

async function loadProfilesByUserIds(userIds: string[]): Promise<Map<string, ProfileRow>> {
  const profileMap = new Map<string, ProfileRow>();
  if (userIds.length === 0) return profileMap;

  const base = supabase.from('profiles');

  let data: ProfileRow[] | null = null;
  let error: any = null;
  ({ data, error } = await base.select('user_id,display_name,full_name,email').in('user_id', userIds));

  if (error && isMissingColumnError(error, 'display_name')) {
    ({ data, error } = await base.select('user_id,full_name,email').in('user_id', userIds));
  }

  if (error || !data) return profileMap;

  for (const row of data) {
    profileMap.set(row.user_id, row);
  }
  return profileMap;
}

function normalizeMembers(rows: TenantMembershipRow[]): TenantMembershipRow[] {
  const byUser = new Map<string, TenantMembershipRow>();
  for (const row of rows) byUser.set(row.user_id, row);
  return Array.from(byUser.values());
}

export default function AdminTeamMembers() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [members, setMembers] = useState<TeamMemberRow[]>([]);

  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<MemberRole>('agent');

  const canAdd = useMemo(() => {
    return !!tenantId && newUserId.trim().length >= 10 && !!newRole;
  }, [tenantId, newUserId, newRole]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      setLoading(true);
      setError('');
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in.');

        const { data, error: tErr } = await supabase
          .from('tenants')
          .select('id,name,created_at')
          .order('created_at', { ascending: false });

        if (tErr) throw tErr;
        if (!mounted) return;

        const nextTenants = (data || []) as Tenant[];
        setTenants(nextTenants);
        if (nextTenants.length > 0) setTenantId(nextTenants[0].id);
      } catch (e: any) {
        if (mounted) setError(String(e?.message || e));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void boot();
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

    const { data: rows, error: mErr } = await supabase
      .from('tenant_memberships')
      .select('tenant_id,user_id,role,created_at')
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: true });

    if (mErr) {
      setError(mErr.message);
      return;
    }

    const normalized = normalizeMembers((rows || []) as TenantMembershipRow[]);
    const userIds = normalized.map((row) => row.user_id);
    const profileMap = await loadProfilesByUserIds(userIds);

    setMembers(
      normalized.map((row) => {
        const profile = profileMap.get(row.user_id);
        return {
          ...row,
          display_name: profile?.display_name || profile?.full_name || null,
          email: profile?.email || null,
        };
      })
    );
  }

  async function addMember() {
    if (!canAdd) return;

    setSaving(true);
    setError('');

    try {
      const userId = newUserId.trim();
      const role = newRole;

      const { data: existing, error: exErr } = await supabase
        .from('tenant_memberships')
        .select('tenant_id,user_id,role')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (exErr) throw exErr;

      if (existing) {
        const { error: uErr } = await supabase
          .from('tenant_memberships')
          .update({ role })
          .eq('tenant_id', tenantId)
          .eq('user_id', userId);
        if (uErr) throw uErr;
      } else {
        const { error: iErr } = await supabase
          .from('tenant_memberships')
          .insert({ tenant_id: tenantId, user_id: userId, role });
        if (iErr) throw iErr;
      }

      setNewUserId('');
      setNewRole('agent');
      await refresh();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function updateRole(row: TeamMemberRow, role: string) {
    setError('');
    const { error: uErr } = await supabase
      .from('tenant_memberships')
      .update({ role })
      .eq('tenant_id', tenantId)
      .eq('user_id', row.user_id);

    if (uErr) {
      setError(uErr.message);
      return;
    }

    await refresh();
  }

  async function removeMember(row: TeamMemberRow) {
    const confirmed = window.confirm(`Remove ${row.display_name || row.user_id} from this tenant?`);
    if (!confirmed) return;

    setError('');
    const { error: dErr } = await supabase
      .from('tenant_memberships')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('user_id', row.user_id);

    if (dErr) {
      setError(dErr.message);
      return;
    }

    await refresh();
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading team members...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Team Members</h1>
        <p className="text-sm text-slate-400 mt-2">
          Manage tenant membership and assignment roles. Owner/Admin access required by policy.
        </p>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm font-medium">
          {error}
        </div>
      ) : null}

      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">User UUID</label>
            <input
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="auth.users UUID"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as MemberRole)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={addMember}
              disabled={!canAdd || saving}
              className="w-full rounded-xl bg-emerald-500 text-black font-black uppercase tracking-widest px-4 py-2 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Add Member'}
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Use the Supabase Auth user UUID. Add a profile row to show a readable name in assignment controls.
        </p>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Members</h2>
          <button
            onClick={() => void refresh()}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-widest"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-black/30 text-slate-400 uppercase tracking-widest text-[11px]">
              <tr>
                <th className="text-left px-6 py-3">Member</th>
                <th className="text-left px-6 py-3">Role</th>
                <th className="text-left px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-slate-400">
                    No members found for this tenant.
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.user_id} className="border-t border-white/5">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-100">{member.display_name || '(no display name)'}</div>
                      <div className="text-xs text-slate-400 mt-1">{member.email || 'No email on profile'}</div>
                      <div className="text-xs text-slate-500 font-mono mt-1">{member.user_id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full px-2.5 py-1 text-xs border border-white/15">
                        {member.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <select
                          value={member.role}
                          onChange={(e) => void updateRole(member, e.target.value)}
                          className="rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-xs"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => void removeMember(member)}
                          className="rounded-lg bg-red-500/15 border border-red-500/30 text-red-200 px-3 py-1.5 text-xs font-bold uppercase tracking-widest"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
