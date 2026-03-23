import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

function iso(value) {
  return new Date(value).toISOString();
}

async function latestTenantId() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id,name,created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error('No tenant found to seed sample admin data');
  return data.id;
}

async function ensureRow({ table, match, payload, select = '*' }) {
  let query = supabase.from(table).select(select).limit(1);
  for (const [key, value] of Object.entries(match)) {
    query = query.eq(key, value);
  }

  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq('id', existing.id)
      .select(select)
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.from(table).insert(payload).select(select).single();
  if (error) throw error;
  return data;
}

async function main() {
  const tenantId = argValue('--tenant-id') || await latestTenantId();
  const now = new Date();
  const dayStart = iso('2026-03-23T00:00:00.000Z');
  const dayEnd = iso('2026-03-23T23:59:59.000Z');
  const nextRunAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const primarySource = await ensureRow({
    table: 'research_sources',
    match: { tenant_id: tenantId, canonical_url: 'https://example.com/grants-watch' },
    payload: {
      tenant_id: tenantId,
      source_type: 'website',
      label: 'Grant Watch Source',
      canonical_url: 'https://example.com/grants-watch',
      domain: 'example.com',
      status: 'active',
      priority: 91,
      active: true,
      paused: false,
      schedule_paused: false,
      schedule_status: 'scheduled',
      last_run_at: now.toISOString(),
      next_run_at: nextRunAt,
      last_run_status: 'completed_with_warnings',
      metadata: { seed_key: 'wrapup_grant_watch_source', seeded_by: 'seed-admin-wrapup-sample-data' },
      updated_at: now.toISOString(),
    },
  });

  const duplicateSource = await ensureRow({
    table: 'research_sources',
    match: { tenant_id: tenantId, canonical_url: 'https://www.example.com/grants-watch' },
    payload: {
      tenant_id: tenantId,
      source_type: 'website',
      label: 'Grant Watch Mirror',
      canonical_url: 'https://www.example.com/grants-watch',
      domain: 'www.example.com',
      status: 'review',
      priority: 54,
      active: true,
      paused: true,
      schedule_paused: true,
      schedule_status: 'paused',
      last_run_status: 'duplicate_candidate',
      metadata: { seed_key: 'wrapup_grant_watch_duplicate', seeded_by: 'seed-admin-wrapup-sample-data' },
      updated_at: now.toISOString(),
    },
  });

  await ensureRow({
    table: 'source_health_scores',
    match: { source_id: primarySource.id, period_start: dayStart, period_end: dayEnd },
    payload: {
      source_id: primarySource.id,
      period_start: dayStart,
      period_end: dayEnd,
      availability_pct: 97.5,
      avg_latency_ms: 840,
      error_count: 4,
      duplicate_count: 1,
      items_retrieved: 18,
      score: 72,
      metadata: { seed_key: 'wrapup_grant_watch_health' },
    },
  });

  await ensureRow({
    table: 'source_recommendations',
    match: { tenant_id: tenantId, canonical_url: 'https://example.com/grants-watch', label: 'Grant Watch Source' },
    payload: {
      tenant_id: tenantId,
      source_type: 'website',
      label: 'Grant Watch Source',
      canonical_url: 'https://example.com/grants-watch',
      domain: 'example.com',
      rationale: 'Recommended follow-up coverage for grant monitoring before 100-user launch testing.',
      confidence_score: 88,
      status: 'open',
      recommended_by: 'system',
      metadata: { seed_key: 'wrapup_grant_watch_recommendation' },
      updated_at: now.toISOString(),
    },
  });

  await ensureRow({
    table: 'source_duplicates',
    match: { source_id: primarySource.id, duplicate_source_id: duplicateSource.id },
    payload: {
      source_id: primarySource.id,
      duplicate_source_id: duplicateSource.id,
      duplicate_reason: 'Mirror domain overlaps with canonical grant watch source.',
      confidence: 92,
      status: 'open',
      metadata: { seed_key: 'wrapup_grant_watch_duplicate_link' },
    },
  });

  const pendingCommand = await ensureRow({
    table: 'admin_commands',
    match: { tenant_id: tenantId, command_text: 'Review the grant-watch source and keep it queued for follow-up until warnings are cleared.' },
    payload: {
      tenant_id: tenantId,
      issuer_user_id: null,
      command_text: 'Review the grant-watch source and keep it queued for follow-up until warnings are cleared.',
      command_type: 'source_registry',
      target_scope: 'tenant',
      parsed_intent: {
        command_type: 'source_registry',
        target_label: 'Source Registry',
        validation_status: 'needs_review',
        confidence_label: 'heuristic',
        notes: ['Seeded sample command for Windows-side command center smoke validation.'],
      },
      validation_status: 'needs_review',
      approval_required: true,
      approval_status: 'pending',
      queue_handoff_state: 'queued',
      execution_outcome: 'pending',
      execution_summary: 'Queued locally for operator review after source warnings are triaged.',
      related_source_id: primarySource.id,
      metadata: { seed_key: 'wrapup_pending_command' },
      updated_at: now.toISOString(),
    },
  });

  const completedCommand = await ensureRow({
    table: 'admin_commands',
    match: { tenant_id: tenantId, command_text: 'Summarize launch readiness signals for the current grant-watch operating lane.' },
    payload: {
      tenant_id: tenantId,
      issuer_user_id: null,
      command_text: 'Summarize launch readiness signals for the current grant-watch operating lane.',
      command_type: 'readiness',
      target_scope: 'tenant',
      parsed_intent: {
        command_type: 'readiness',
        target_label: 'Launch Readiness',
        validation_status: 'valid',
        confidence_label: 'seeded',
        notes: ['Sample completed command linked to a seeded agent run summary.'],
      },
      validation_status: 'valid',
      approval_required: true,
      approval_status: 'approved',
      queue_handoff_state: 'completed',
      execution_outcome: 'completed',
      execution_summary: 'Readiness summary generated and attached to executive surfaces.',
      related_source_id: primarySource.id,
      metadata: { seed_key: 'wrapup_completed_command' },
      updated_at: now.toISOString(),
    },
  });

  await ensureRow({
    table: 'admin_command_approvals',
    match: { command_id: completedCommand.id, decision: 'approved' },
    payload: {
      command_id: completedCommand.id,
      approver_user_id: null,
      decision: 'approved',
      reason: 'Sample approval to demonstrate completed command state in the inbox.',
      metadata: { seed_key: 'wrapup_completed_command_approval' },
      approved_at: now.toISOString(),
    },
  });

  const agentSummary = await ensureRow({
    table: 'agent_run_summaries',
    match: { tenant_id: tenantId, agent_name: 'Launch Readiness Analyst', headline: 'Grant-watch lane is viable but still warning on source quality.' },
    payload: {
      tenant_id: tenantId,
      command_id: completedCommand.id,
      agent_name: 'Launch Readiness Analyst',
      source_kind: 'research_source',
      source_id: primarySource.id,
      run_status: 'completed',
      risk_level: 'moderate',
      headline: 'Grant-watch lane is viable but still warning on source quality.',
      summary: 'Queue health is stable, but the seeded source still shows duplicate overlap and below-target health score. Operator review is still required before removing warnings.',
      prompt_tokens: 842,
      completion_tokens: 191,
      duration_ms: 3210,
      estimated_cost_usd: 0.08,
      metadata: { seed_key: 'wrapup_agent_summary' },
    },
  });

  await ensureRow({
    table: 'executive_briefings',
    match: { tenant_id: tenantId, briefing_type: 'ceo', title: '100-user readiness checkpoint for grant-watch lane' },
    payload: {
      tenant_id: tenantId,
      briefing_type: 'ceo',
      title: '100-user readiness checkpoint for grant-watch lane',
      summary: 'Core launch controls are in place. Remaining risk is concentrated in source-quality follow-up and readiness warnings rather than control-plane availability.',
      top_updates: [
        'Windows-side admin command persistence is live.',
        'Source registry warnings are now stored locally in Supabase.',
        'Control-plane readiness summary is available to staff surfaces.',
      ],
      blockers: ['Seeded source still has duplicate and health warnings requiring operator review.'],
      recommended_actions: ['Clear duplicate source warning.', 'Run another source-quality check after review.', 'Keep command queue review-gated.'],
      critical_alerts: ['Readiness is not blocked, but warning-state signals remain open.'],
      source_run_ids: [agentSummary.id],
      published_by: 'seed-admin-wrapup-sample-data',
      metadata: { seed_key: 'wrapup_executive_briefing' },
    },
  });

  const readinessSeeds = [
    {
      checklist_key: 'control_plane_write_path',
      area: 'control-plane',
      label: 'Control-plane write path is available',
      status: 'pass',
      severity: 'high',
      owner: 'platform-ops',
      notes: 'Netlify handler writes and remote migrations are applied.',
    },
    {
      checklist_key: 'source_registry_warning_review',
      area: 'research',
      label: 'Source registry warnings reviewed',
      status: 'warn',
      severity: 'medium',
      owner: 'research-ops',
      notes: 'Seeded warning set remains open to demonstrate review flow.',
    },
    {
      checklist_key: 'command_inbox_feedback_loop',
      area: 'admin-ops',
      label: 'Command inbox feedback loop visible end-to-end',
      status: 'pass',
      severity: 'high',
      owner: 'platform-ops',
      notes: 'Local command, approval, and agent summary records are present.',
    },
  ];

  for (const item of readinessSeeds) {
    await ensureRow({
      table: 'launch_readiness_checks',
      match: { tenant_id: tenantId, checklist_key: item.checklist_key },
      payload: {
        tenant_id: tenantId,
        checklist_key: item.checklist_key,
        area: item.area,
        label: item.label,
        status: item.status,
        severity: item.severity,
        owner: item.owner,
        evidence: [{ source: 'seed-admin-wrapup-sample-data', note: item.notes }],
        notes: item.notes,
        due_at: dueAt,
        completed_at: item.status === 'pass' ? now.toISOString() : null,
        metadata: { seed_key: `wrapup_${item.checklist_key}` },
        updated_at: now.toISOString(),
      },
    });
  }

  await ensureRow({
    table: 'simulation_runs',
    match: { tenant_id: tenantId, simulation_type: '100_user', summary: 'Seeded 100-user simulation sample for admin control-plane readiness display.' },
    payload: {
      tenant_id: tenantId,
      simulation_type: '100_user',
      status: 'completed',
      target_users: 100,
      actual_users: 96,
      incident_count: 1,
      started_at: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      ended_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      summary: 'Seeded 100-user simulation sample for admin control-plane readiness display.',
      metrics: { p95_latency_ms: 930, queue_backlog_max: 4, staff_interventions: 1 },
      metadata: { seed_key: 'wrapup_simulation_run' },
      updated_at: now.toISOString(),
    },
  });

  console.log(JSON.stringify({
    ok: true,
    tenant_id: tenantId,
    seeded: {
      primary_source_id: primarySource.id,
      duplicate_source_id: duplicateSource.id,
      pending_command_id: pendingCommand.id,
      completed_command_id: completedCommand.id,
      agent_summary_id: agentSummary.id,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});