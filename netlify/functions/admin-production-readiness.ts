import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function isMissingSchema(error: any) {
  const message = String(error?.message || '').toLowerCase();
  return (
    (message.includes('relation') && message.includes('does not exist'))
    || (message.includes('column') && message.includes('does not exist'))
    || (message.includes('could not find the table') && message.includes('schema cache'))
  );
}

async function safeRows(query: PromiseLike<{ data?: unknown; error?: any }>) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { rows: [], missing: true, error: null };
    return { rows: [], missing: false, error };
  }
  return { rows: Array.isArray(data) ? data : [], missing: false, error: null };
}

async function safeCount(query: PromiseLike<{ count?: number | null; error?: any }>) {
  const { count, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { count: 0, missing: true, error: null };
    return { count: 0, missing: false, error };
  }
  return { count: Number(count || 0), missing: false, error: null };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

    await requireStaffUser(event);
    const query = QuerySchema.parse(event.queryStringParameters || {});
    const supabase = getAdminSupabaseClient();
    const tenantId = query.tenant_id || null;
    const limit = query.limit;

    const applyTenant = <T,>(builder: T & { eq: (column: string, value: string) => T }) => {
      if (!tenantId) return builder;
      return builder.eq('tenant_id', tenantId);
    };

    const [
      systemConfig,
      openIncidents,
      readinessChecks,
      blockedChecks,
      simulations,
      briefings,
      runSummaries,
    ] = await Promise.all([
      safeRows(
        supabase
          .from('system_config')
          .select('id,scope,scope_id,system_mode,queue_enabled,ai_jobs_enabled,research_jobs_enabled,notifications_enabled,updated_at,metadata')
          .eq('scope', 'global')
          .is('scope_id', null)
          .limit(1),
      ),
      safeCount(
        supabase
          .from('incident_events')
          .select('*', { count: 'exact', head: true })
          .in('status', ['open', 'investigating', 'mitigated']),
      ),
      safeRows(
        applyTenant(
          supabase
            .from('launch_readiness_checks')
            .select('id,checklist_key,area,label,status,severity,owner,updated_at,completed_at,due_at')
            .order('updated_at', { ascending: false })
            .limit(limit),
        ),
      ),
      safeCount(
        applyTenant(
          supabase
            .from('launch_readiness_checks')
            .select('*', { count: 'exact', head: true })
            .in('status', ['blocked', 'warn']),
        ),
      ),
      safeRows(
        applyTenant(
          supabase
            .from('simulation_runs')
            .select('id,simulation_type,status,target_users,actual_users,incident_count,started_at,ended_at,summary,updated_at')
            .order('created_at', { ascending: false })
            .limit(limit),
        ),
      ),
      safeRows(
        applyTenant(
          supabase
            .from('executive_briefings')
            .select('id,briefing_type,title,summary,created_at')
            .order('created_at', { ascending: false })
            .limit(Math.min(limit, 5)),
        ),
      ),
      safeRows(
        applyTenant(
          supabase
            .from('agent_run_summaries')
            .select('id,agent_name,run_status,risk_level,headline,summary,estimated_cost_usd,duration_ms,created_at')
            .order('created_at', { ascending: false })
            .limit(Math.min(limit, 10)),
        ),
      ),
    ]);

    const missingTables = [
      ...(systemConfig.missing ? ['system_config'] : []),
      ...(openIncidents.missing ? ['incident_events'] : []),
      ...(readinessChecks.missing ? ['launch_readiness_checks'] : []),
      ...(blockedChecks.missing ? ['launch_readiness_checks'] : []),
      ...(simulations.missing ? ['simulation_runs'] : []),
      ...(briefings.missing ? ['executive_briefings'] : []),
      ...(runSummaries.missing ? ['agent_run_summaries'] : []),
    ];

    const warnings = [
      ...(systemConfig.error ? [`system_config: ${asText(systemConfig.error.message || 'query_error')}`] : []),
      ...(openIncidents.error ? [`incident_events: ${asText(openIncidents.error.message || 'query_error')}`] : []),
      ...(readinessChecks.error ? [`launch_readiness_checks: ${asText(readinessChecks.error.message || 'query_error')}`] : []),
      ...(simulations.error ? [`simulation_runs: ${asText(simulations.error.message || 'query_error')}`] : []),
      ...(briefings.error ? [`executive_briefings: ${asText(briefings.error.message || 'query_error')}`] : []),
      ...(runSummaries.error ? [`agent_run_summaries: ${asText(runSummaries.error.message || 'query_error')}`] : []),
    ];

    const currentConfig = (systemConfig.rows[0] || {}) as Record<string, unknown>;
    const readinessRows = readinessChecks.rows as Array<Record<string, unknown>>;
    const readinessSummary = readinessRows.reduce((acc, row) => {
      const status = asText(row.status) || 'pending';
      acc.total += 1;
      if (status === 'pass') acc.passed += 1;
      if (status === 'warn') acc.warn += 1;
      if (status === 'blocked') acc.blocked += 1;
      if (status === 'pending') acc.pending += 1;
      return acc;
    }, { total: 0, passed: 0, warn: 0, blocked: 0, pending: 0 });

    return json(200, {
      ok: true,
      generated_at: new Date().toISOString(),
      tenant_id: tenantId,
      control_plane: {
        system_mode: asText(currentConfig.system_mode) || 'unknown',
        queue_enabled: Boolean(currentConfig.queue_enabled),
        ai_jobs_enabled: Boolean(currentConfig.ai_jobs_enabled),
        research_jobs_enabled: Boolean(currentConfig.research_jobs_enabled),
        notifications_enabled: Boolean(currentConfig.notifications_enabled),
        updated_at: asText(currentConfig.updated_at) || null,
      },
      summary: {
        active_incidents: openIncidents.count,
        readiness_checks: readinessSummary,
        blocking_or_warn_checks: blockedChecks.count,
        recent_briefings: briefings.rows.length,
        recent_agent_runs: runSummaries.rows.length,
        recent_simulations: simulations.rows.length,
      },
      readiness_checks: readinessRows,
      recent_simulations: simulations.rows,
      executive_briefings: briefings.rows,
      agent_run_summaries: runSummaries.rows,
      missing_tables: Array.from(new Set(missingTables)),
      warnings,
    });
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};