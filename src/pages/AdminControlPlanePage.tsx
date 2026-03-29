import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

type ControlPlaneState = {
  system_mode: string;
  queue_enabled: boolean;
  ai_jobs_enabled: boolean;
  research_jobs_enabled: boolean;
  notifications_enabled: boolean;
  metadata?: Record<string, unknown>;
};

type ControlPlaneStateResponse = {
  ok: boolean;
  timestamp?: string;
  write_enabled?: boolean;
  state?: ControlPlaneState;
  active_incidents?: number;
  missing_tables?: string[];
  warnings?: string[];
  error?: string;
};

type FeatureFlag = {
  id: string;
  flag_key: string;
  enabled: boolean;
  scope: string;
  scope_id: string | null;
  rollout_pct: number | null;
  expires_at?: string | null;
  updated_at?: string;
};

type FlagsResponse = {
  ok: boolean;
  flags?: FeatureFlag[];
  count?: number;
  missing_tables?: string[];
  warnings?: string[];
  error?: string;
};

type Incident = {
  id: string;
  severity: string;
  status: string;
  title: string;
  started_at: string;
};

type IncidentsResponse = {
  ok: boolean;
  incidents?: Incident[];
  count?: number;
  missing_tables?: string[];
  warnings?: string[];
  error?: string;
};

type AuditEntry = {
  id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  target_type: string;
  reason: string | null;
  created_at: string;
};

type AuditResponse = {
  ok: boolean;
  entries?: AuditEntry[];
  count?: number;
  missing_tables?: string[];
  warnings?: string[];
  error?: string;
};

type ReadinessCheck = {
  id: string;
  checklist_key: string;
  area: string;
  label: string;
  status: string;
  severity: string;
  owner?: string | null;
  updated_at?: string;
  completed_at?: string | null;
  due_at?: string | null;
};

type SimulationRun = {
  id: string;
  simulation_type: string;
  status: string;
  target_users: number;
  actual_users?: number | null;
  incident_count: number;
  started_at?: string | null;
  ended_at?: string | null;
  summary?: string | null;
};

type BriefingPreview = {
  id: string;
  briefing_type: string;
  title: string;
  summary: string;
  created_at: string;
};

type AgentRunSummary = {
  id: string;
  agent_name: string;
  run_status: string;
  risk_level: string;
  headline?: string | null;
  summary: string;
  estimated_cost_usd?: number | null;
  duration_ms?: number | null;
  created_at: string;
};

type ProductionReadinessResponse = {
  ok: boolean;
  summary?: {
    active_incidents: number;
    readiness_checks: {
      total: number;
      passed: number;
      warn: number;
      blocked: number;
      pending: number;
    };
    blocking_or_warn_checks: number;
    recent_briefings: number;
    recent_agent_runs: number;
    recent_simulations: number;
  };
  readiness_checks?: ReadinessCheck[];
  recent_simulations?: SimulationRun[];
  executive_briefings?: BriefingPreview[];
  agent_run_summaries?: AgentRunSummary[];
  missing_tables?: string[];
  warnings?: string[];
};

type BadgeTone = 'ok' | 'warn' | 'critical';

const SYSTEM_MODES = ['development', 'research', 'production', 'maintenance', 'degraded', 'emergency_stop'] as const;

function panelClass() {
  return 'rounded-2xl border border-white/10 bg-slate-900 p-5';
}

function badgeClass(tone: BadgeTone) {
  if (tone === 'ok') return 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-200';
  if (tone === 'critical') return 'bg-red-500/15 border border-red-500/30 text-red-200';
  return 'bg-amber-500/15 border border-amber-500/30 text-amber-200';
}

function boolLabel(value: boolean) {
  return value ? 'Enabled' : 'Disabled';
}

export default function AdminControlPlanePage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');

  const [snapshot, setSnapshot] = useState<ControlPlaneStateResponse | null>(null);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [readiness, setReadiness] = useState<ProductionReadinessResponse | null>(null);

  const [modeDraft, setModeDraft] = useState<(typeof SYSTEM_MODES)[number]>('research');
  const [modeReason, setModeReason] = useState('');

  const [flagKey, setFlagKey] = useState('');
  const [flagEnabled, setFlagEnabled] = useState(true);
  const [flagReason, setFlagReason] = useState('');

  const [emergencyReason, setEmergencyReason] = useState('');

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      setError('');

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in');

        const { data, error: tenantError } = await supabase
          .from('tenants')
          .select('id,name,created_at')
          .order('created_at', { ascending: false });

        if (tenantError) throw tenantError;
        if (!active) return;

        const list = (data || []) as Tenant[];
        setTenants(list);
        if (list.length > 0) {
          const firstId = list[0].id;
          setTenantId((prev) => prev || firstId);
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
    if (!loading && tenantId) {
      void refreshAll();
    }
  }, [tenantId, loading]);

  const canWrite = Boolean(snapshot?.write_enabled);

  const warnings = useMemo(() => {
    const all = [
      ...(snapshot?.warnings || []),
      ...((snapshot?.missing_tables || []).map((x) => `missing table: ${x}`)),
      ...(readiness?.warnings || []),
      ...((readiness?.missing_tables || []).map((x) => `missing table: ${x}`)),
    ];
    return all;
  }, [snapshot, readiness]);

  async function authToken() {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('Sign in required');
    return token;
  }

  async function getJson<T>(path: string): Promise<T> {
    const token = await authToken();
    const response = await fetch(path, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String((body as { error?: string })?.error || `${path} failed (${response.status})`));
    }
    return body as T;
  }

  async function postJson<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    const token = await authToken();
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String((body as { error?: string })?.error || `${path} failed (${response.status})`));
    }
    return body as T;
  }

  async function refreshAll() {
    if (!tenantId) return;

    try {
      setRefreshing(true);
      setError('');

      const qs = `tenant_id=${encodeURIComponent(tenantId)}`;
      const [stateRes, flagsRes, incidentsRes, auditRes, readinessRes] = await Promise.all([
        getJson<ControlPlaneStateResponse>(`/.netlify/functions/admin-control-plane-state?${qs}`),
        getJson<FlagsResponse>(`/.netlify/functions/admin-control-plane-flags?${qs}&limit=50`),
        getJson<IncidentsResponse>(`/.netlify/functions/admin-control-plane-incidents?${qs}&status=active&limit=20`),
        getJson<AuditResponse>(`/.netlify/functions/admin-control-plane-audit?${qs}&limit=20`),
        getJson<ProductionReadinessResponse>(`/.netlify/functions/admin-production-readiness?${qs}&limit=10`),
      ]);

      setSnapshot(stateRes);
      setFlags(Array.isArray(flagsRes.flags) ? flagsRes.flags : []);
      setIncidents(Array.isArray(incidentsRes.incidents) ? incidentsRes.incidents : []);
      setAudit(Array.isArray(auditRes.entries) ? auditRes.entries : []);
      setReadiness(readinessRes);
      if (stateRes?.state?.system_mode && SYSTEM_MODES.includes(stateRes.state.system_mode as (typeof SYSTEM_MODES)[number])) {
        setModeDraft(stateRes.state.system_mode as (typeof SYSTEM_MODES)[number]);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  async function setSystemMode() {
    if (!tenantId) return;
    if (!modeReason.trim()) {
      setError('Mode change reason is required.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await postJson('/.netlify/functions/admin-control-plane-mode', {
        tenant_id: tenantId,
        system_mode: modeDraft,
        reason: modeReason.trim(),
      });
      setModeReason('');
      await refreshAll();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  }

  async function setFeatureFlag() {
    if (!tenantId) return;
    if (!flagKey.trim()) {
      setError('Flag key is required.');
      return;
    }
    if (!flagReason.trim()) {
      setError('Feature flag reason is required.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await postJson('/.netlify/functions/admin-control-plane-flag-set', {
        tenant_id: tenantId,
        flag_key: flagKey.trim().toLowerCase(),
        enabled: flagEnabled,
        reason: flagReason.trim(),
        scope: 'global',
      });
      setFlagReason('');
      await refreshAll();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  }

  async function triggerEmergencyStop() {
    if (!tenantId) return;
    if (!emergencyReason.trim()) {
      setError('Emergency reason is required.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await postJson('/.netlify/functions/admin-control-plane-emergency-stop', {
        tenant_id: tenantId,
        reason: emergencyReason.trim(),
        title: 'Manual emergency stop from Admin Control Plane',
      });
      setEmergencyReason('');
      await refreshAll();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="max-w-6xl mx-auto p-6 text-slate-200">Loading control plane...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="rounded-3xl border border-white/10 bg-slate-900 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Admin Control Plane</h1>
          <p className="mt-2 text-sm text-slate-400">Operational control surface for system mode, feature flags, queue/AI gates, and incidents.</p>
        </div>
        <button
          onClick={() => void refreshAll()}
          disabled={refreshing || !tenantId}
          className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className={panelClass()}>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Tenant</label>
        <select
          value={tenantId}
          onChange={(event) => setTenantId(event.target.value)}
          className="w-full max-w-2xl rounded-xl bg-black/30 border border-white/10 px-3 py-2"
        >
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
          ))}
        </select>
      </div>

      {!canWrite ? (
        <div className={`rounded-2xl p-4 text-sm ${badgeClass('warn')}`}>
          Write actions are disabled in gateway runtime. Set <code>CONTROL_PLANE_WRITE_ENABLED=true</code> to allow write endpoints.
        </div>
      ) : null}

      {error ? (
        <div className={`rounded-2xl p-4 text-sm ${badgeClass('critical')}`}>{error}</div>
      ) : null}

      {warnings.length > 0 ? (
        <div className={panelClass()}>
          <h2 className="text-sm font-black uppercase tracking-wider text-amber-200">Warnings</h2>
          <ul className="mt-3 space-y-2 text-xs text-amber-100">
            {warnings.map((item) => (
              <li key={item} className="rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-2">{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={panelClass()}>
          <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">System Snapshot</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <div>Mode: <span className="font-bold text-white">{snapshot?.state?.system_mode || 'unknown'}</span></div>
            <div>Queue: <span className="font-bold text-white">{boolLabel(Boolean(snapshot?.state?.queue_enabled))}</span></div>
            <div>AI Jobs: <span className="font-bold text-white">{boolLabel(Boolean(snapshot?.state?.ai_jobs_enabled))}</span></div>
            <div>Research Jobs: <span className="font-bold text-white">{boolLabel(Boolean(snapshot?.state?.research_jobs_enabled))}</span></div>
            <div>Notifications: <span className="font-bold text-white">{boolLabel(Boolean(snapshot?.state?.notifications_enabled))}</span></div>
            <div>Active Incidents: <span className="font-bold text-white">{snapshot?.active_incidents ?? 0}</span></div>
          </div>
        </div>

        <div className={panelClass()}>
          <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">Set System Mode</h2>
          <div className="mt-3 space-y-3">
            <select
              value={modeDraft}
              onChange={(event) => setModeDraft(event.target.value as (typeof SYSTEM_MODES)[number])}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            >
              {SYSTEM_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
            <input
              value={modeReason}
              onChange={(event) => setModeReason(event.target.value)}
              placeholder="Reason for mode change"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
            <button
              onClick={() => void setSystemMode()}
              disabled={!canWrite || submitting || !tenantId}
              className="w-full rounded-xl bg-cyan-500/20 border border-cyan-400/30 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
            >
              Apply Mode
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className={panelClass()}>
          <h2 className="text-xs font-black uppercase tracking-wider text-cyan-300">Readiness Checks</h2>
          <div className="mt-3 text-3xl font-black text-white">{readiness?.summary?.readiness_checks.total ?? 0}</div>
          <div className="mt-2 text-xs text-slate-400">pass {readiness?.summary?.readiness_checks.passed ?? 0} · warn {readiness?.summary?.readiness_checks.warn ?? 0} · blocked {readiness?.summary?.readiness_checks.blocked ?? 0}</div>
        </div>
        <div className={panelClass()}>
          <h2 className="text-xs font-black uppercase tracking-wider text-cyan-300">Blocking / Warn</h2>
          <div className="mt-3 text-3xl font-black text-white">{readiness?.summary?.blocking_or_warn_checks ?? 0}</div>
          <div className="mt-2 text-xs text-slate-400">Production gate items needing action now.</div>
        </div>
        <div className={panelClass()}>
          <h2 className="text-xs font-black uppercase tracking-wider text-cyan-300">Recent Simulations</h2>
          <div className="mt-3 text-3xl font-black text-white">{readiness?.summary?.recent_simulations ?? 0}</div>
          <div className="mt-2 text-xs text-slate-400">Latest 100-user or staged simulation records stored in Supabase.</div>
        </div>
        <div className={panelClass()}>
          <h2 className="text-xs font-black uppercase tracking-wider text-cyan-300">Agent Summaries</h2>
          <div className="mt-3 text-3xl font-black text-white">{readiness?.summary?.recent_agent_runs ?? 0}</div>
          <div className="mt-2 text-xs text-slate-400">Recent high-level run summaries available for executive review.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={panelClass()}>
          <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">Feature Flag Upsert</h2>
          <div className="mt-3 space-y-3">
            <input
              value={flagKey}
              onChange={(event) => setFlagKey(event.target.value)}
              placeholder="flag key (example: opportunity_engine_enabled)"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={flagEnabled}
                onChange={(event) => setFlagEnabled(event.target.checked)}
              />
              Enabled
            </label>
            <input
              value={flagReason}
              onChange={(event) => setFlagReason(event.target.value)}
              placeholder="Reason for flag change"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
            <button
              onClick={() => void setFeatureFlag()}
              disabled={!canWrite || submitting || !tenantId}
              className="w-full rounded-xl bg-cyan-500/20 border border-cyan-400/30 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
            >
              Save Flag
            </button>
          </div>
        </div>

        <div className={panelClass()}>
          <h2 className="text-sm font-black uppercase tracking-wider text-red-300">Emergency Stop</h2>
          <p className="mt-2 text-xs text-slate-400">Disables queue, AI jobs, research jobs, and notifications. Use only during active incidents.</p>
          <div className="mt-3 space-y-3">
            <input
              value={emergencyReason}
              onChange={(event) => setEmergencyReason(event.target.value)}
              placeholder="Incident reason"
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
            <button
              onClick={() => void triggerEmergencyStop()}
              disabled={!canWrite || submitting || !tenantId}
              className="w-full rounded-xl bg-red-500/20 border border-red-400/30 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
            >
              Trigger Emergency Stop
            </button>
          </div>
        </div>
      </div>

      <div className={panelClass()}>
        <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">Recent Feature Flags</h2>
        <div className="mt-3 space-y-2 text-xs text-slate-300">
          {flags.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-slate-500">No flags returned.</div>
          ) : (
            flags.map((flag) => (
              <div key={flag.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 flex flex-wrap gap-3 items-center justify-between">
                <div className="font-semibold text-slate-100">{flag.flag_key}</div>
                <div>{flag.enabled ? 'enabled' : 'disabled'}</div>
                <div>scope={flag.scope}</div>
                <div>rollout={flag.rollout_pct ?? 'n/a'}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={panelClass()}>
          <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">Active Incidents</h2>
          <div className="mt-3 space-y-2 text-xs text-slate-300">
            {incidents.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-slate-500">No active incidents.</div>
            ) : (
              incidents.map((incident) => (
                <div key={incident.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="font-semibold text-slate-100">{incident.title}</div>
                  <div className="mt-1">{incident.severity} · {incident.status}</div>
                  <div className="text-slate-500">{incident.started_at}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={panelClass()}>
          <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">Recent Audit Entries</h2>
          <div className="mt-3 space-y-2 text-xs text-slate-300">
            {audit.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-slate-500">No audit entries.</div>
            ) : (
              audit.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="font-semibold text-slate-100">{entry.action}</div>
                  <div className="mt-1">{entry.actor_role || 'unknown'} · {entry.target_type}</div>
                  <div className="text-slate-500">{entry.created_at}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={panelClass()}>
          <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">Launch Readiness Queue</h2>
          <div className="mt-3 space-y-2 text-xs text-slate-300">
            {(readiness?.readiness_checks || []).length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-slate-500">No readiness checks recorded yet.</div>
            ) : (
              (readiness?.readiness_checks || []).map((item) => (
                <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="font-semibold text-slate-100">{item.label}</div>
                  <div className="mt-1">{item.area} · {item.status} · {item.severity}</div>
                  <div className="text-slate-500">{item.owner || 'unassigned'} · {item.updated_at || 'n/a'}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={panelClass()}>
          <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">Simulation Runs</h2>
          <div className="mt-3 space-y-2 text-xs text-slate-300">
            {(readiness?.recent_simulations || []).length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-slate-500">No simulation runs recorded yet.</div>
            ) : (
              (readiness?.recent_simulations || []).map((item) => (
                <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="font-semibold text-slate-100">{item.simulation_type} · {item.status}</div>
                  <div className="mt-1">target {item.target_users} · actual {item.actual_users ?? 'n/a'} · incidents {item.incident_count}</div>
                  <div className="text-slate-500">{item.started_at || item.ended_at || 'no timestamps'}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={panelClass()}>
          <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">Executive Summaries</h2>
          <div className="mt-3 space-y-2 text-xs text-slate-300">
            {(readiness?.executive_briefings || []).length === 0 && (readiness?.agent_run_summaries || []).length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-slate-500">No local briefings or run summaries recorded yet.</div>
            ) : null}
            {(readiness?.executive_briefings || []).map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="font-semibold text-slate-100">{item.title}</div>
                <div className="mt-1 text-slate-400">{item.summary}</div>
                <div className="text-slate-500">{item.created_at}</div>
              </div>
            ))}
            {(readiness?.agent_run_summaries || []).map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="font-semibold text-slate-100">{item.agent_name} · {item.run_status} · {item.risk_level}</div>
                <div className="mt-1 text-slate-400">{item.headline || item.summary}</div>
                <div className="text-slate-500">{item.created_at}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
