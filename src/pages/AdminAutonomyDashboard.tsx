import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AutonomyAgentActivityCards from '../components/admin/AutonomyAgentActivityCards';
import AutonomyAlertStrip from '../components/admin/AutonomyAlertStrip';
import AutonomyContextPanel from '../components/admin/AutonomyContextPanel';
import AutonomyEventsPanel from '../components/admin/AutonomyEventsPanel';
import AutonomyLogPanels from '../components/admin/AutonomyLogPanels';
import AutonomySummaryCards from '../components/admin/AutonomySummaryCards';
import useAutonomyDashboard from '../hooks/useAutonomyDashboard';

type Tenant = {
  id: string;
  name: string;
  created_at?: string;
};

export default function AdminAutonomyDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [hours, setHours] = useState(72);
  const [limit, setLimit] = useState(50);
  const [agentName, setAgentName] = useState('');
  const [activeStage, setActiveStage] = useState('');
  const [failureSource, setFailureSource] = useState<'all' | 'event' | 'action' | 'message'>('all');
  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantError, setTenantError] = useState('');

  const autonomy = useAutonomyDashboard({ tenantId, hours, limit, agentName, activeStage, failureSource });

  const agentOptions = useMemo(() => autonomy.payload.agent_activity.map((agent) => agent.agent_name), [autonomy.payload.agent_activity]);
  const stageOptions = useMemo(() => Array.from(new Set(autonomy.payload.agent_context.map((context) => context.active_stage))).filter(Boolean), [autonomy.payload.agent_context]);

  useEffect(() => {
    let active = true;

    async function boot() {
      setTenantLoading(true);
      setTenantError('');

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user?.id) throw new Error('Not signed in');

        const { data, error } = await supabase
          .from('tenants')
          .select('id,name,created_at')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!active) return;

        const rows = (data || []) as Tenant[];
        setTenants(rows);
      } catch (error: any) {
        if (active) setTenantError(String(error?.message || error));
      } finally {
        if (active) setTenantLoading(false);
      }
    }

    void boot();
    return () => {
      active = false;
    };
  }, []);

  if (tenantLoading) {
    return <div className="max-w-7xl mx-auto p-6 text-slate-200">Loading autonomy dashboard...</div>;
  }

  const error = tenantError || autonomy.error;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="rounded-3xl border border-white/10 bg-slate-900 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Autonomy Visibility Dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">Internal-only view of events, agent activity, handoffs, skipped actions, and failures.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={tenantId}
            onChange={(event) => {
              setTenantId(event.target.value);
              setLimit(50);
            }}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          >
            <option value="">All tenants</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
            ))}
          </select>
          <select
            value={hours}
            onChange={(event) => {
              setHours(Number(event.target.value));
              setLimit(50);
            }}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          >
            <option value={24}>24h</option>
            <option value={72}>72h</option>
            <option value={168}>7d</option>
            <option value={720}>30d</option>
          </select>
          <select
            value={agentName}
            onChange={(event) => {
              setAgentName(event.target.value);
              setLimit(50);
            }}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          >
            <option value="">All agents</option>
            {agentOptions.map((agent) => (
              <option key={agent} value={agent}>{agent}</option>
            ))}
          </select>
          <select
            value={activeStage}
            onChange={(event) => {
              setActiveStage(event.target.value);
              setLimit(50);
            }}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          >
            <option value="">All stages</option>
            {stageOptions.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
          <select
            value={failureSource}
            onChange={(event) => {
              setFailureSource(event.target.value as 'all' | 'event' | 'action' | 'message');
              setLimit(50);
            }}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          >
            <option value="all">All failure sources</option>
            <option value="event">Event failures</option>
            <option value="action">Action failures</option>
            <option value="message">Message failures</option>
          </select>
          <button
            type="button"
            onClick={() => void autonomy.refresh()}
            disabled={autonomy.refreshing}
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
          >
            {autonomy.refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      ) : null}

      <AutonomyAlertStrip summary={autonomy.payload.summary} contexts={autonomy.payload.agent_context} hours={hours} />

      <AutonomySummaryCards summary={autonomy.payload.summary} />

      {autonomy.loading ? (
        <div className="rounded-3xl border border-white/10 bg-slate-900 p-8 text-sm text-slate-400">
          Loading autonomy visibility data...
        </div>
      ) : autonomy.payload.empty_state ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-slate-900/80 p-8 text-sm text-slate-400">
          No autonomy activity has been recorded yet for the selected window.
        </div>
      ) : (
        <>
          <AutonomyContextPanel contexts={autonomy.payload.agent_context} />
          <AutonomyAgentActivityCards agents={autonomy.payload.agent_activity} />
          <AutonomyLogPanels
            handoffs={autonomy.payload.handoff_log}
            skippedActions={autonomy.payload.skipped_actions}
            failures={autonomy.payload.failures}
          />
          <AutonomyEventsPanel events={autonomy.payload.events} />
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setLimit((current) => Math.min(current + 50, 500))}
              disabled={autonomy.refreshing || autonomy.payload.events.length < limit || limit >= 500}
              className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40"
            >
              {limit >= 500 ? 'Max Results Loaded' : autonomy.payload.events.length < limit ? 'All Visible Results Loaded' : 'Load More'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}