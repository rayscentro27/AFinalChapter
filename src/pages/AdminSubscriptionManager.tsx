import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { billingAdapter } from '../billing/adapter';
import { PlanCode, SubscriptionRecord, SubscriptionStatus } from '../billing/types';

type Tenant = { id: string; name: string | null };
type Member = { user_id: string; role: string | null };

const PLAN_CODES: PlanCode[] = ['FREE', 'GROWTH', 'PREMIUM'];
const STATUSES: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'incomplete'];

function planFromSubscription(subscription: SubscriptionRecord | undefined): PlanCode {
  const tier = String(subscription?.tier || '').toLowerCase();
  if (tier === 'growth') return 'GROWTH';
  if (tier === 'premium') return 'PREMIUM';
  if (tier === 'free') return 'FREE';
  return (subscription?.plan_code || 'FREE') as PlanCode;
}

export default function AdminSubscriptionManager() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [subs, setSubs] = useState<SubscriptionRecord[]>([]);

  const [draftPlanByUser, setDraftPlanByUser] = useState<Record<string, PlanCode>>({});
  const [draftStatusByUser, setDraftStatusByUser] = useState<Record<string, SubscriptionStatus>>({});

  const [tierFilter, setTierFilter] = useState<'ALL' | PlanCode>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SubscriptionStatus>('ALL');

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      if (!user?.id) {
        if (!active) return;
        setIsSuperAdmin(false);
        setCheckingAccess(false);
        return;
      }

      setCheckingAccess(true);
      const { data, error: accessError } = await supabase.rpc('nexus_is_master_admin_compat');

      if (!active) return;

      if (accessError) {
        setIsSuperAdmin(user.role === 'admin');
      } else {
        setIsSuperAdmin(Boolean(data));
      }

      setCheckingAccess(false);
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function loadTenantsAndSubscriptions(nextTenantId?: string) {
    const selectedTenantId = nextTenantId || tenantId;
    if (!selectedTenantId) return;

    const subRes = await supabase
      .from('subscriptions')
      .select('id,user_id,tenant_id,plan_code,tier,status,provider,provider_customer_id,provider_subscription_id,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end,created_at,updated_at')
      .eq('tenant_id', selectedTenantId)
      .order('updated_at', { ascending: false });

    if (subRes.error) throw new Error(subRes.error.message || 'Unable to load subscriptions.');

    let memberRows: Member[] = [];

    const memberRes = await supabase
      .from('tenant_memberships')
      .select('user_id,role')
      .eq('tenant_id', selectedTenantId);

    if (!memberRes.error) {
      memberRows = (memberRes.data || []) as Member[];
    } else {
      const fallbackRes = await supabase
        .from('tenant_members')
        .select('user_id,role')
        .eq('tenant_id', selectedTenantId);

      if (fallbackRes.error) throw new Error(memberRes.error.message || 'Unable to load members.');
      memberRows = (fallbackRes.data || []) as Member[];
    }

    const subRows = (subRes.data || []) as SubscriptionRecord[];

    setMembers(memberRows);
    setSubs(subRows);

    const initialPlan: Record<string, PlanCode> = {};
    const initialStatus: Record<string, SubscriptionStatus> = {};

    for (const member of memberRows) {
      const found = subRows.find((s) => s.user_id === member.user_id);
      initialPlan[member.user_id] = planFromSubscription(found);
      initialStatus[member.user_id] = (found?.status || 'active') as SubscriptionStatus;
    }

    setDraftPlanByUser(initialPlan);
    setDraftStatusByUser(initialStatus);
  }

  useEffect(() => {
    let active = true;

    async function boot() {
      if (checkingAccess) return;

      if (!isSuperAdmin) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const { data: tenantRows, error: tenantError } = await supabase
          .from('tenants')
          .select('id,name')
          .order('name', { ascending: true });

        if (tenantError) throw new Error(tenantError.message || 'Unable to load tenants.');
        if (!active) return;

        const rows = (tenantRows || []) as Tenant[];
        setTenants(rows);
        const first = rows[0]?.id || '';
        setTenantId(first);

        if (first) {
          await loadTenantsAndSubscriptions(first);
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
  }, [checkingAccess, isSuperAdmin]);

  const subByUser = useMemo(() => {
    const map = new Map<string, SubscriptionRecord>();
    for (const sub of subs) map.set(sub.user_id, sub);
    return map;
  }, [subs]);

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const current = subByUser.get(member.user_id);
      const plan = planFromSubscription(current);
      const status = (current?.status || 'active') as SubscriptionStatus;

      if (tierFilter !== 'ALL' && plan !== tierFilter) return false;
      if (statusFilter !== 'ALL' && status !== statusFilter) return false;
      return true;
    });
  }, [members, subByUser, tierFilter, statusFilter]);

  async function applyForUser(userId: string) {
    if (!tenantId) return;

    setBusyUserId(userId);
    setError('');
    setSuccess('');
    try {
      const plan = draftPlanByUser[userId] || 'FREE';
      const status = draftStatusByUser[userId] || 'active';

      await billingAdapter.setSubscription({
        userId,
        tenantId,
        planCode: plan,
        status,
        provider: 'manual',
        eventType: 'subscription.admin_override',
        eventPayload: {
          plan_code: plan,
          tier: plan.toLowerCase(),
          status,
          actor_user_id: user?.id || null,
        },
      });

      setSuccess(`Updated subscription for ${userId.slice(0, 8)}.`);
      await loadTenantsAndSubscriptions(tenantId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusyUserId(null);
    }
  }

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Verifying super admin access...</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Super admin access required.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading subscription manager...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-slate-100 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Admin Subscriptions</h1>
        <p className="text-sm text-slate-400 mt-1">View subscriptions by tier/status and apply manual test overrides.</p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Tenant</label>
          <select
            className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm"
            value={tenantId}
            onChange={(e) => {
              const nextTenantId = e.target.value;
              setTenantId(nextTenantId);
              void loadTenantsAndSubscriptions(nextTenantId);
            }}
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Tier Filter</label>
          <select
            className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as 'ALL' | PlanCode)}
          >
            <option value="ALL">All tiers</option>
            {PLAN_CODES.map((tier) => (
              <option key={tier} value={tier}>{tier}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Status Filter</label>
          <select
            className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | SubscriptionStatus)}
          >
            <option value="ALL">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 text-rose-200 text-sm px-4 py-3">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-500/50 bg-emerald-950/30 text-emerald-200 text-sm px-4 py-3">{success}</div> : null}

      <div className="text-xs text-slate-400">Showing {filteredMembers.length} of {members.length} members for current filters.</div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-slate-800/70 text-slate-300 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Current</th>
                <th className="px-4 py-3 text-left">Provider</th>
                <th className="px-4 py-3 text-left">Period End</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredMembers.map((member) => {
                const current = subByUser.get(member.user_id);
                const currentPlan = planFromSubscription(current);
                return (
                  <tr key={member.user_id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">{member.user_id}</td>
                    <td className="px-4 py-3 text-slate-300">{member.role || '-'}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {currentPlan} / {(current?.status || 'active')}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{current?.provider || '-'}</td>
                    <td className="px-4 py-3 text-slate-300">{current?.current_period_end ? new Date(current.current_period_end).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-3">
                      <select
                        className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs"
                        value={draftPlanByUser[member.user_id] || 'FREE'}
                        onChange={(e) => {
                          const next = e.target.value as PlanCode;
                          setDraftPlanByUser((prev) => ({ ...prev, [member.user_id]: next }));
                        }}
                      >
                        {PLAN_CODES.map((plan) => (
                          <option key={plan} value={plan}>{plan}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs"
                        value={draftStatusByUser[member.user_id] || 'active'}
                        onChange={(e) => {
                          const next = e.target.value as SubscriptionStatus;
                          setDraftStatusByUser((prev) => ({ ...prev, [member.user_id]: next }));
                        }}
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void applyForUser(member.user_id)}
                        disabled={busyUserId !== null}
                        className="rounded-lg bg-cyan-500 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
                      >
                        {busyUserId === member.user_id ? 'Saving...' : 'Apply'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
