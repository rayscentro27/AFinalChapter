import React, { useEffect, useMemo, useState } from 'react';
import { Building2, ShieldCheck, Users, Palette, CreditCard, AlertTriangle, KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

type OrganizationRow = {
  id: string;
  org_name: string;
  org_type: string | null;
  status: string | null;
  owner_email: string | null;
  created_at: string | null;
};

type OrganizationUserRow = {
  org_id: string;
  user_id: string;
  role: string | null;
  status: string | null;
};

type BrandingRow = {
  org_id: string;
  brand_name: string | null;
  domain: string | null;
  support_email: string | null;
};

type ModuleRow = {
  org_id: string;
  module_name: string;
  enabled: boolean | null;
};

type ApiKeyRow = {
  org_id: string | null;
  status: string | null;
};

type ComplianceRow = {
  org_id: string | null;
  acknowledged: boolean | null;
};

export default function AdminOrganizationDashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [organizationUsers, setOrganizationUsers] = useState<OrganizationUserRow[]>([]);
  const [brandingConfigs, setBrandingConfigs] = useState<BrandingRow[]>([]);
  const [moduleConfigs, setModuleConfigs] = useState<ModuleRow[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [complianceRecords, setComplianceRecords] = useState<ComplianceRow[]>([]);

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
        const [orgsRes, usersRes, brandingRes, modulesRes, apiKeysRes, complianceRes] = await Promise.all([
          supabase.from('organizations').select('id,org_name,org_type,status,owner_email,created_at').order('created_at', { ascending: false }),
          supabase.from('organization_users').select('org_id,user_id,role,status'),
          supabase.from('branding_configs').select('org_id,brand_name,domain,support_email'),
          supabase.from('org_module_configs').select('org_id,module_name,enabled'),
          supabase.from('api_keys').select('org_id,status'),
          supabase.from('compliance_records').select('org_id,acknowledged'),
        ]);

        if (orgsRes.error) throw orgsRes.error;
        if (usersRes.error) throw usersRes.error;
        if (brandingRes.error) throw brandingRes.error;
        if (modulesRes.error) throw modulesRes.error;
        if (apiKeysRes.error) throw apiKeysRes.error;
        if (complianceRes.error) throw complianceRes.error;

        if (!active) return;

        setOrganizations((orgsRes.data || []) as OrganizationRow[]);
        setOrganizationUsers((usersRes.data || []) as OrganizationUserRow[]);
        setBrandingConfigs((brandingRes.data || []) as BrandingRow[]);
        setModuleConfigs((modulesRes.data || []) as ModuleRow[]);
        setApiKeys((apiKeysRes.data || []) as ApiKeyRow[]);
        setComplianceRecords((complianceRes.data || []) as ComplianceRow[]);
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

  const metrics = useMemo(() => {
    const activeOrganizations = organizations.filter((item) => String(item.status || 'active').toLowerCase() === 'active').length;
    const brandedOrganizations = new Set(brandingConfigs.map((item) => item.org_id)).size;
    const activeUsers = organizationUsers.filter((item) => String(item.status || 'active').toLowerCase() === 'active').length;
    const enabledModules = moduleConfigs.filter((item) => item.enabled !== false).length;
    const activeApiKeys = apiKeys.filter((item) => String(item.status || 'active').toLowerCase() === 'active').length;
    const pendingCompliance = complianceRecords.filter((item) => item.acknowledged !== true).length;

    return {
      organizations: organizations.length,
      activeOrganizations,
      brandedOrganizations,
      activeUsers,
      enabledModules,
      activeApiKeys,
      pendingCompliance,
    };
  }, [organizations, brandingConfigs, organizationUsers, moduleConfigs, apiKeys, complianceRecords]);

  const organizationRows = useMemo(() => {
    return organizations.map((organization) => {
      const orgUsers = organizationUsers.filter((item) => item.org_id === organization.id);
      const orgBranding = brandingConfigs.find((item) => item.org_id === organization.id);
      const orgModules = moduleConfigs.filter((item) => item.org_id === organization.id);
      const orgApiKeys = apiKeys.filter((item) => item.org_id === organization.id);
      const orgCompliance = complianceRecords.filter((item) => item.org_id === organization.id);

      return {
        ...organization,
        seats: orgUsers.length,
        admins: orgUsers.filter((item) => String(item.role || '').toLowerCase() === 'admin').length,
        modulesEnabled: orgModules.filter((item) => item.enabled !== false).length,
        hasBranding: Boolean(orgBranding),
        domain: orgBranding?.domain || '-',
        supportEmail: orgBranding?.support_email || organization.owner_email || '-',
        activeApiKeys: orgApiKeys.filter((item) => String(item.status || 'active').toLowerCase() === 'active').length,
        pendingCompliance: orgCompliance.filter((item) => item.acknowledged !== true).length,
      };
    });
  }, [organizations, organizationUsers, brandingConfigs, moduleConfigs, apiKeys, complianceRecords]);

  if (!isAdmin) {
    return <div className="mx-auto max-w-4xl px-4 py-8 text-slate-100"><div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm">Internal admin access required.</div></div>;
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-300">Loading organization admin dashboard...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 text-slate-100 space-y-6">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#eff6ff_42%,#f8fafc_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Organization Admin</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Enterprise organization dashboard</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">View organization count, operator seats, branding adoption, enabled modules, API footprint, and outstanding compliance posture in one internal surface.</p>
      </div>

      {error ? <div className="rounded-md border border-rose-500/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon={Building2} label="Organizations" value={metrics.organizations} sub={`${metrics.activeOrganizations} active`} />
        <MetricCard icon={Users} label="Active Seats" value={metrics.activeUsers} sub="Organization users" />
        <MetricCard icon={Palette} label="Branded Orgs" value={metrics.brandedOrganizations} sub="White-label enabled" />
        <MetricCard icon={ShieldCheck} label="Modules Enabled" value={metrics.enabledModules} sub="Across all organizations" />
        <MetricCard icon={KeyRound} label="Active API Keys" value={metrics.activeApiKeys} sub="Gateway footprint" />
        <MetricCard icon={AlertTriangle} label="Pending Compliance" value={metrics.pendingCompliance} sub="Unacknowledged records" tone="warn" />
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Organization Directory</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">Operational posture by organization</h2>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">Use this page as the rollup, then drill into Members, Roles, Billing, and White-Label Settings for changes.</div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Organization</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Seats</th>
                <th className="px-4 py-3 text-left">Admins</th>
                <th className="px-4 py-3 text-left">Branding</th>
                <th className="px-4 py-3 text-left">Domain</th>
                <th className="px-4 py-3 text-left">Modules</th>
                <th className="px-4 py-3 text-left">API Keys</th>
                <th className="px-4 py-3 text-left">Compliance</th>
                <th className="px-4 py-3 text-left">Owner / Support</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {organizationRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{row.org_name}</div>
                    <div className="text-xs text-slate-500">Created {row.created_at ? new Date(row.created_at).toLocaleDateString() : 'Unknown'}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.org_type || '-'}</td>
                  <td className="px-4 py-3"><StatusPill value={row.status || 'active'} /></td>
                  <td className="px-4 py-3 text-slate-700">{row.seats}</td>
                  <td className="px-4 py-3 text-slate-700">{row.admins}</td>
                  <td className="px-4 py-3 text-slate-700">{row.hasBranding ? 'Configured' : 'Pending'}</td>
                  <td className="px-4 py-3 text-slate-700">{row.domain}</td>
                  <td className="px-4 py-3 text-slate-700">{row.modulesEnabled}</td>
                  <td className="px-4 py-3 text-slate-700">{row.activeApiKeys}</td>
                  <td className="px-4 py-3 text-slate-700">{row.pendingCompliance}</td>
                  <td className="px-4 py-3 text-slate-700">{row.supportEmail}</td>
                </tr>
              ))}
              {organizationRows.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={11}>No organizations found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, tone = 'default' }: { icon: React.ElementType; label: string; value: number; sub: string; tone?: 'default' | 'warn' }) {
  const accent = tone === 'warn' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-sky-700 bg-sky-50 border-sky-200';

  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</p>
          <div className="mt-3 text-3xl font-semibold text-slate-950">{value}</div>
          <div className="mt-1 text-sm text-slate-500">{sub}</div>
        </div>
        <div className={`rounded-2xl border px-3 py-3 ${accent}`}><Icon size={20} /></div>
      </div>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const normalized = String(value || '').toLowerCase();
  const className = normalized === 'active'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : normalized === 'draft'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${className}`}>{value}</span>;
}