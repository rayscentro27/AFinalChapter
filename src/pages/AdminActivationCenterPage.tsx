import React, { useMemo, useState } from 'react';
import { Bot, ChevronRight, Clock3, RadioTower, ShieldCheck, Wrench } from 'lucide-react';
import { useAdminActivationCenter } from '../hooks/useAdminActivationCenter';
import { authFetchJson } from '../hooks/adminAccess';

function badgeClass(status: string) {
  if (status === 'ready' || status === 'completed' || status === 'configured') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'blocked' || status === 'missing') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'warn' || status === 'needs_review') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'optional' || status === 'waived') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

function pretty(value: string) {
  return String(value || '').replace(/_/g, ' ');
}

const PATH_TO_HASH: Record<string, string> = {
  '/admin/nexus-one': 'admin_nexus_one',
  '/admin/credentials': 'admin_credentials',
  '/admin/ceo-briefing': 'admin_ceo_briefing',
  '/admin/ai-command-center': 'admin_super_admin_command_center',
  '/admin/control-plane': 'admin_control_plane',
  '/admin/source-registry': 'admin_source_registry',
  '/admin/research-approvals': 'admin_research_approvals',
  '/settings': 'settings',
};

function openInternalPath(path?: string | null) {
  if (!path) return;
  window.history.pushState({}, '', path);
  const pathname = path.replace(/\?.*$/, '');
  window.location.hash = PATH_TO_HASH[pathname] || 'dashboard';
}

export default function AdminActivationCenterPage() {
  const {
    user,
    checkingAccess,
    isAuthorized,
    loading,
    refreshing,
    saving,
    error,
    tenants,
    selectedTenantId,
    setSelectedTenantId,
    summary,
    controlPlane,
    nexusOne,
    launchSummary,
    domains,
    groupedCredentials,
    steps,
    environments,
    warnings,
    missingTables,
    refresh,
    updateDomain,
    updateCredential,
    updateStep,
    updateEnvironment,
  } = useAdminActivationCenter();
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [credentialSummary, setCredentialSummary] = useState<any>(null);
  const [credentialError, setCredentialError] = useState('');

  React.useEffect(() => {
    let active = true;

    async function loadCredentialSummary() {
      if (!selectedTenantId) return;
      try {
        setCredentialError('');
        const response = await authFetchJson<any>(`/.netlify/functions/admin-credential-readiness?tenant_id=${encodeURIComponent(selectedTenantId)}`);
        if (active) setCredentialSummary(response?.summary || null);
      } catch (error: any) {
        if (active) setCredentialError(String(error?.message || error));
      }
    }

    void loadCredentialSummary();
    return () => {
      active = false;
    };
  }, [selectedTenantId]);

  const environmentByKey = useMemo(() => {
    const map = new Map<string, typeof environments[number]>();
    for (const item of environments) map.set(item.readiness_key, item);
    return map;
  }, [environments]);

  if (checkingAccess) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-500">Verifying Nexus One activation access...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-slate-100">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Unauthorized</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900">Internal setup activation access required</h1>
          <p className="mt-3 text-sm text-slate-600">This route is reserved for internal staff and super-admin setup work.</p>
          <p className="mt-2 text-xs text-slate-500">Signed in role: {String(user?.role || 'unknown')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f3fdf8_40%,#f8fafc_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Nexus One Control Plane</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Super-admin activation center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">One Windows-owned surface for setup readiness, missing credentials, launch blockers, and the next required action before pilot or 100-user activation.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={selectedTenantId} onChange={(event) => setSelectedTenantId(event.target.value)}>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>
            <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing || !selectedTenantId}>
              {refreshing ? 'Refreshing...' : 'Refresh Activation'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Overall Status</p>
            <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass(summary?.overall_status || 'pending')}`}>{pretty(summary?.overall_status || 'pending')}</div>
            <p className="mt-3 text-sm text-slate-600">{summary?.next_step || 'Awaiting activation summary.'}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Blocked Domains</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{summary?.blocked_domains || 0}</p>
            <p className="mt-2 text-sm text-slate-600">Domains that still block activation.</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Missing Credentials</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{summary?.missing_credentials || 0}</p>
            <p className="mt-2 text-sm text-slate-600">Controlled visibility only. No secret values are exposed.</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pending Steps</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{summary?.pending_steps || 0}</p>
            <p className="mt-2 text-sm text-slate-600">Required activation tasks still open.</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Active Incidents</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{summary?.active_incidents || 0}</p>
            <p className="mt-2 text-sm text-slate-600">Open incidents still visible in the control plane.</p>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {warnings.length > 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warnings.join(' | ')}</div> : null}
      {missingTables.length > 0 ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Missing tables affecting activation visibility: {missingTables.join(', ')}</div> : null}
      {loading && domains.length === 0 ? <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Loading Nexus One activation center...</div> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Launch Readiness Summary</p>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">Pilot and 100-user activation state</h2>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Control plane mode: <span className="font-black text-slate-900">{pretty(controlPlane?.system_mode || 'unknown')}</span>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {['nexus_one', 'pilot_10_user', 'launch_100_user'].map((key) => {
              const item = environmentByKey.get(key);
              return (
                <article key={key} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{item?.label || pretty(key)}</p>
                      <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass(item?.effective_status || item?.status || 'pending')}`}>{pretty(item?.effective_status || item?.status || 'pending')}</div>
                    </div>
                    <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700" onClick={() => void updateEnvironment(key, { status: 'ready' })} disabled={saving}>Mark Ready</button>
                  </div>
                  {item?.effective_blocking_items?.length ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-700">{item.effective_blocking_items[0]}</div> : null}
                  {!item?.effective_blocking_items?.length && item?.effective_warning_items?.length ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">{item.effective_warning_items[0]}</div> : null}
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Blocked Checks</p>
              <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{launchSummary?.blocked_checks || 0}</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Warning Checks</p>
              <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{launchSummary?.warning_checks || 0}</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Recent Simulations</p>
              <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{launchSummary?.recent_simulations?.length || 0}</p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Blocking Issues</p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">What still blocks activation</h2>
          <div className="mt-4 space-y-3">
            {(summary?.blocking_issues || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No explicit blocking issues are recorded right now.</div>
            ) : (
              (summary?.blocking_issues || []).map((issue) => (
                <div key={issue} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-800">{issue}</div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Nexus One Executive Layer</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">Executive visibility and operator readiness</h2>
          </div>
          <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700" onClick={() => openInternalPath('/admin/ceo-briefing')}>Open CEO Briefing</button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard icon={ShieldCheck} label="Briefings" value={String(nexusOne?.briefings_count || 0)} hint={nexusOne?.latest_briefing_title || 'No executive briefing stored yet.'} />
          <StatCard icon={Wrench} label="Pending Approvals" value={String(nexusOne?.pending_command_approvals || 0)} hint="Commands waiting for review" />
          <StatCard icon={Clock3} label="Queued Or Running" value={String(nexusOne?.running_or_queued_commands || 0)} hint="Operational command backlog" />
          <StatCard icon={RadioTower} label="Fresh Workers" value={String(nexusOne?.fresh_workers || 0)} hint={`${nexusOne?.stale_workers || 0} stale workers`} />
          <StatCard icon={Bot} label="Manus Positioning" value="Optional" hint="Operator-side only, not the production source of truth" />
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Readiness Checklist</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">Per-domain activation state</h2>
          </div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {domains.map((domain) => (
            <article key={domain.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{pretty(domain.domain_key)}</p>
                  <h3 className="mt-2 text-lg font-black tracking-tight text-slate-900">{domain.display_name}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{domain.guidance}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass(domain.effective_status)}`}>{pretty(domain.effective_status)}</span>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass(domain.effective_severity === 'critical' ? 'blocked' : domain.effective_severity === 'high' ? 'warn' : 'ready')}`}>{pretty(domain.effective_severity)}</span>
                </div>
              </div>

              {domain.effective_missing_items.length > 0 ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-black uppercase tracking-widest text-[10px]">Missing Or Risk Items</p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-900">
                    {domain.effective_missing_items.slice(0, 4).map((item) => <li key={item}>• {item}</li>)}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                <textarea
                  value={notesDrafts[domain.id] ?? domain.notes ?? ''}
                  onChange={(event) => setNotesDrafts((current) => ({ ...current, [domain.id]: event.target.value }))}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="Operator notes, what is missing, or what was confirmed"
                />
                <div className="flex flex-col gap-2">
                  <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700" onClick={() => void updateDomain(domain.domain_key, { status: 'ready', notes: notesDrafts[domain.id] ?? domain.notes ?? '' })} disabled={saving}>Ready</button>
                  <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700" onClick={() => void updateDomain(domain.domain_key, { status: 'warn', notes: notesDrafts[domain.id] ?? domain.notes ?? '' })} disabled={saving}>Warn</button>
                  <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700" onClick={() => void updateDomain(domain.domain_key, { status: 'blocked', notes: notesDrafts[domain.id] ?? domain.notes ?? '' })} disabled={saving}>Block</button>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 flex-wrap text-xs text-slate-500">
                <div>Last checked: {domain.last_checked_at ? new Date(domain.last_checked_at).toLocaleString() : 'Not recorded yet'}</div>
                {domain.action_path ? <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-black uppercase tracking-widest text-[10px] text-slate-700" onClick={() => openInternalPath(domain.action_path)}>Open Surface <ChevronRight size={12} /></button> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Credential Readiness</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">Secure credential posture summary</h2>
          </div>
          <button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700" onClick={() => openInternalPath('/admin/credentials')}>Open Credential System</button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Overall</p>
            <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass(credentialSummary?.overall_status || 'pending')}`}>{pretty(credentialSummary?.overall_status || 'pending')}</div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pilot</p>
            <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass(credentialSummary?.pilot_status || 'pending')}`}>{pretty(credentialSummary?.pilot_status || 'pending')}</div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Launch</p>
            <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass(credentialSummary?.launch_status || 'pending')}`}>{pretty(credentialSummary?.launch_status || 'pending')}</div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Blocked Integrations</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{credentialSummary?.blocked_integrations || 0}</p>
          </div>
        </div>

        {credentialSummary?.next_step ? <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{credentialSummary.next_step}</div> : null}
        {credentialError ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{credentialError}</div> : null}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Credential Status Panel</p>
        <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">Controlled integration and credential visibility</h2>
        <div className="mt-5 space-y-4">
          {Array.from(groupedCredentials.entries()).map(([domainKey, items]) => (
            <div key={domainKey} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">{pretty(domainKey)}</p>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm text-slate-700">
                  <thead>
                    <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <th className="pb-2 pr-4">Item</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Visibility</th>
                      <th className="pb-2 pr-4">Instruction</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-t border-slate-200 align-top">
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-slate-900">{item.label}</div>
                          {item.masked_value ? <div className="mt-1 text-xs text-slate-500">{item.masked_value}</div> : null}
                        </td>
                        <td className="py-3 pr-4"><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass(item.status)}`}>{pretty(item.status)}</span></td>
                        <td className="py-3 pr-4 text-xs text-slate-500">{item.is_sensitive ? 'Sensitive' : 'Descriptor only'}</td>
                        <td className="py-3 pr-4 text-xs leading-5 text-slate-600">{item.instructions}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700" onClick={() => void updateCredential(item.domain_key, item.credential_key, { status: 'configured' })} disabled={saving}>Configured</button>
                            <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700" onClick={() => void updateCredential(item.domain_key, item.credential_key, { status: 'needs_review' })} disabled={saving}>Review</button>
                            <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700" onClick={() => void updateCredential(item.domain_key, item.credential_key, { status: 'missing' })} disabled={saving}>Missing</button>
                            {item.action_path ? <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700" onClick={() => openInternalPath(item.action_path)}>Open</button> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Activation Steps</p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">Guided first-run flow</h2>
          <div className="mt-4 space-y-3">
            {steps.map((step) => (
              <article key={step.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{pretty(step.domain_key)}</p>
                    <h3 className="mt-2 text-base font-black tracking-tight text-slate-900">{step.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass(step.status)}`}>{pretty(step.status)}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void updateStep(step.step_key, { status: 'completed' })} disabled={saving}>Complete</button>
                  <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50" onClick={() => void updateStep(step.step_key, { status: 'pending' })} disabled={saving}>Reset</button>
                  {step.action_path ? <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700" onClick={() => openInternalPath(step.action_path)}>Open Surface</button> : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Readiness And Notes</p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">What to do next for the 100-user test</h2>
          <div className="mt-4 space-y-4">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Recommended Next Step</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{summary?.next_step || 'Awaiting activation summary.'}</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pilot Checklist Signal</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{launchSummary?.blocked_checks ? 'Pilot blockers still exist. Clear them before declaring day-0 start.' : 'No blocked launch checks are currently visible from this readiness surface.'}</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">100-User Test Signal</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">Use this control plane together with pilot results before approving the 100-user test. Warning-state domains should be resolved or explicitly accepted first.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint }: { icon: React.ElementType; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{value}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{hint}</p>
        </div>
        <div className="rounded-2xl bg-white p-3 text-emerald-700 shadow-sm">
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}
