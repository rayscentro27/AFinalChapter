import React, { useEffect, useState } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, ShieldX, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAdminCredentialReadiness } from '../hooks/useAdminCredentialReadiness';

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

function badgeClass(status: string) {
  if (status === 'ready' || status === 'passed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'blocked' || status === 'failed' || status === 'missing') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'degraded' || status === 'warn' || status === 'manual_review') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'optional' || status === 'not_applicable') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

function pretty(value: string) {
  return String(value || '').replace(/_/g, ' ');
}

function openInternalPath(path?: string | null) {
  if (!path) return;
  window.history.pushState({}, '', path);
  window.location.hash = path.replace(/\//g, '_').replace(/^_+/, '') || 'dashboard';
}

export default function AdminCredentialManagementPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [bootError, setBootError] = useState('');
  const [bootLoading, setBootLoading] = useState(true);

  const {
    loading,
    refreshing,
    verifyingKey,
    error,
    summary,
    events,
    warnings,
    missingTables,
    groupedByCategory,
    refresh,
    verifyIntegration,
  } = useAdminCredentialReadiness(tenantId);

  useEffect(() => {
    let active = true;

    async function boot() {
      setBootLoading(true);
      setBootError('');
      try {
        const { data, error } = await supabase
          .from('tenants')
          .select('id,name,created_at')
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (!active) return;
        const rows = (data || []) as Tenant[];
        setTenants(rows);
        if (rows[0]) setTenantId((current) => current || rows[0].id);
      } catch (err: any) {
        if (active) setBootError(String(err?.message || err));
      } finally {
        if (active) setBootLoading(false);
      }
    }

    void boot();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f7fdf9_45%,#eef6ff_100%)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Nexus Credential Management System</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Secure credential readiness</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Read-only credential posture, verification workflows, and launch-gate readiness without exposing raw secrets in the UI.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50" onClick={() => void refresh()} disabled={refreshing || !tenantId}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard icon={KeyRound} label="Overall" value={pretty(summary?.overall_status || 'pending')} tone={summary?.overall_status || 'pending'} />
          <StatCard icon={ShieldCheck} label="Pilot" value={pretty(summary?.pilot_status || 'pending')} tone={summary?.pilot_status || 'pending'} />
          <StatCard icon={Sparkles} label="Launch" value={pretty(summary?.launch_status || 'pending')} tone={summary?.launch_status || 'pending'} />
          <StatCard icon={ShieldX} label="Blocked" value={String(summary?.blocked_integrations || 0)} tone={(summary?.blocked_integrations || 0) > 0 ? 'blocked' : 'ready'} />
          <StatCard icon={RefreshCw} label="Verification Failures" value={String(summary?.verification_failures || 0)} tone={(summary?.verification_failures || 0) > 0 ? 'blocked' : 'ready'} />
        </div>

        {summary?.next_step ? <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">Next step: {summary.next_step}</div> : null}
      </section>

      {bootLoading || loading ? <div className="rounded-[2rem] border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600 shadow-sm">Loading credential readiness...</div> : null}
      {bootError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{bootError}</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {warnings.length > 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warnings.join(' | ')}</div> : null}
      {missingTables.length > 0 ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Missing migration-backed tables: {missingTables.join(', ')}</div> : null}

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Integration Grid</p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">Pilot and 100-user readiness by integration</h2>
        </div>

        <div className="mt-5 space-y-5">
          {Array.from(groupedByCategory.entries()).map(([category, items]) => (
            <div key={category} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">{pretty(category)}</p>
                <div className="text-xs text-slate-500">{items.length} integrations</div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {items.map((item) => (
                  <article key={item.integration_key} className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{item.integration_key}</p>
                        <h3 className="mt-2 text-lg font-black tracking-tight text-slate-900">{item.display_name}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass(item.status)}`}>{pretty(item.status)}</span>
                        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass(item.verification_state)}`}>{pretty(item.verification_state)}</span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                        <div className="font-black uppercase tracking-widest text-[10px] text-slate-400">Readiness Scope</div>
                        <div className="mt-2">Pilot: <span className="font-semibold text-slate-900">{item.required_pilot ? 'Required' : 'Optional'}</span></div>
                        <div className="mt-1">100-user: <span className="font-semibold text-slate-900">{item.required_launch ? 'Required' : 'Optional'}</span></div>
                        <div className="mt-1">Secret handling: <span className="font-semibold text-slate-900">{pretty(item.secret_handling)}</span></div>
                        {item.masked_hint ? <div className="mt-1">Hint: <span className="font-semibold text-slate-900">{item.masked_hint}</span></div> : null}
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                        <div className="font-black uppercase tracking-widest text-[10px] text-slate-400">Verification</div>
                        <div className="mt-2">{item.last_verification_summary || 'No live verification recorded yet.'}</div>
                        {item.last_verified_at ? <div className="mt-1 text-slate-500">Last verified: {new Date(item.last_verified_at).toLocaleString()}</div> : null}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {item.checks.map((check) => (
                        <div key={check.check_key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{check.label}</div>
                              <div className="mt-1 text-xs text-slate-600">{check.summary}</div>
                            </div>
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass(check.status)}`}>{pretty(check.status)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-xs text-slate-500">{item.instructions}</div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50" onClick={() => void verifyIntegration(item.integration_key)} disabled={Boolean(verifyingKey) && verifyingKey !== item.integration_key}>
                          {verifyingKey === item.integration_key ? 'Verifying...' : 'Run Verify'}
                        </button>
                        {item.action_path ? <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700" onClick={() => openInternalPath(item.action_path)}>Open Surface</button> : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Recent Events</p>
        <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">Verification and readiness events</h2>
        <div className="mt-4 space-y-3">
          {events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No credential readiness events recorded yet.</div>
          ) : events.map((event) => (
            <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{pretty(event.integration_key)} · {pretty(event.event_type)}</div>
                  <div className="mt-1 text-xs text-slate-600">{event.summary || 'No summary recorded.'}</div>
                </div>
                <div className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <div className={`rounded-full border p-2 ${badgeClass(tone)}`}><Icon className="h-4 w-4" /></div>
      </div>
      <div className="mt-3 text-2xl font-black tracking-tight text-slate-900">{value}</div>
    </div>
  );
}