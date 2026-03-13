import { supabaseAdmin } from '../supabase.js';
import { ENV } from '../env.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asInt(value, fallback = 20) {
  const out = Number(value);
  if (!Number.isFinite(out)) return fallback;
  return Math.trunc(out);
}

function asNumber(value, fallback = 0) {
  const out = Number(value);
  if (!Number.isFinite(out)) return fallback;
  return out;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLimit(value, fallback = 20, max = 200) {
  return clamp(asInt(value, fallback), 1, max);
}

function normalizeTenantId(req) {
  return asText(req.query?.tenant_id || req.params?.tenant_id || '');
}

async function requireTenantScopeForInternalKey(req, reply) {
  const internalApiKey = asText(req.headers?.['x-api-key']);
  if (!internalApiKey) return undefined;

  if (internalApiKey !== ENV.INTERNAL_API_KEY) {
    return reply.code(401).send({ ok: false, error: 'unauthorized' });
  }

  const tenantId = normalizeTenantId(req);
  if (!tenantId) {
    return reply.code(400).send({ ok: false, error: 'missing_tenant_id' });
  }

  return undefined;
}


function applyTenantFilter(query, tenantId) {
  if (!tenantId) return query;
  return query.eq('tenant_id', tenantId);
}

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function isRoleMatch(row, aliases) {
  const role = asText(row?.agent_role).toLowerCase();
  const name = asText(row?.agent_name).toLowerCase();
  return aliases.some((alias) => role === alias || name.includes(alias));
}

function summarizeQueryError(error, fallback) {
  if (!error) return fallback;
  const message = asText(error.message || fallback);
  if (isMissingSchema(error)) return `${fallback}: missing research schema migration`;
  return message;
}

function normalizeRate(value) {
  const raw = asNumber(value, 0);
  if (raw <= 0) return 0;
  if (raw > 1) return raw / 100;
  return raw;
}

function toIsoStringOrNull(value) {
  const text = asText(value);
  if (!text) return null;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function safeCount(table, buildQuery) {
  let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
  if (typeof buildQuery === 'function') query = buildQuery(query);

  const { count, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { count: 0, missing: true, error: null };
    return { count: 0, missing: false, error };
  }

  return { count: Number(count || 0), missing: false, error: null };
}

async function safeLatestTimestamp(table, column = 'created_at', buildQuery) {
  let query = supabaseAdmin
    .from(table)
    .select(column)
    .order(column, { ascending: false })
    .limit(1);

  if (typeof buildQuery === 'function') query = buildQuery(query);

  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { value: null, missing: true, error: null };
    return { value: null, missing: false, error };
  }

  return { value: toIsoStringOrNull(data?.[0]?.[column]), missing: false, error: null };
}

function buildReplayPerformance(rows) {
  const list = Array.isArray(rows) ? rows : [];

  let tradesSimulated = 0;
  let wins = 0;
  let losses = 0;

  let pnlRSum = 0;
  let pnlRSamples = 0;

  let pnlPctSum = 0;
  let pnlPctSamples = 0;

  for (const row of list) {
    const tradesTotal = asInt(row?.trades_total, 0);
    const rowWinRate = normalizeRate(row?.win_rate);

    if (tradesTotal > 0) {
      const rowWins = clamp(Math.round(tradesTotal * rowWinRate), 0, tradesTotal);
      const rowLosses = Math.max(tradesTotal - rowWins, 0);

      tradesSimulated += tradesTotal;
      wins += rowWins;
      losses += rowLosses;
    }

    const pnlR = Number(row?.net_pnl);
    if (Number.isFinite(pnlR)) {
      pnlRSum += pnlR;
      pnlRSamples += 1;
    }

    const pctCandidates = [
      row?.meta?.pnl_pct,
      row?.meta?.avg_pnl_pct,
      row?.meta?.pnlPercent,
    ];

    for (const candidate of pctCandidates) {
      const pct = Number(candidate);
      if (Number.isFinite(pct)) {
        pnlPctSum += pct;
        pnlPctSamples += 1;
        break;
      }
    }
  }

  if (tradesSimulated === 0 && list.length > 0) {
    // Fallback when per-row trade counts were never recorded.
    tradesSimulated = list.length;
    losses = Math.max(tradesSimulated - wins, 0);
  }

  const winRate = tradesSimulated > 0 ? wins / tradesSimulated : 0;
  const avgPnlR = pnlRSamples > 0 ? pnlRSum / pnlRSamples : 0;
  const avgPnlPct = pnlPctSamples > 0 ? pnlPctSum / pnlPctSamples : 0;

  return {
    trades_simulated: tradesSimulated,
    wins,
    losses,
    win_rate: Number(winRate.toFixed(4)),
    avg_pnl_r: Number(avgPnlR.toFixed(4)),
    avg_pnl_pct: Number(avgPnlPct.toFixed(4)),
  };
}

export async function researchRoutes(fastify) {
  fastify.get('/api/research/strategy-rankings', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 20);
    const status = asText(req.query?.status);
    const symbol = asText(req.query?.symbol);

    let query = applyTenantFilter(
      supabaseAdmin
        .from('v_research_strategy_rankings')
        .select('id,tenant_id,strategy_id,asset_type,symbol,timeframe,trades_total,win_rate,profit_factor,net_pnl,max_drawdown,sharpe,confidence_band,status,decision,approval_status,created_at,rank')
        .order('rank', { ascending: true })
        .limit(limit),
      tenantId
    );

    if (status) query = query.eq('status', status);
    if (symbol) query = query.eq('symbol', symbol);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'strategy rankings query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/options-rankings', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 20);
    const status = asText(req.query?.status);
    const symbol = asText(req.query?.symbol);

    let query = applyTenantFilter(
      supabaseAdmin
        .from('v_research_options_rankings')
        .select('id,tenant_id,strategy_id,asset_type,symbol,underlying_symbol,structure_type,trades_total,win_rate,profit_factor,net_pnl,max_drawdown,sharpe,confidence_band,status,decision,approval_status,created_at,rank')
        .order('rank', { ascending: true })
        .limit(limit),
      tenantId
    );

    if (status) query = query.eq('status', status);
    if (symbol) query = query.eq('symbol', symbol);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'options rankings query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/agent-scorecards', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 50);
    const role = asText(req.query?.agent_role);

    let query = applyTenantFilter(
      supabaseAdmin
        .from('agent_scorecards')
        .select('id,tenant_id,agent_name,agent_role,score,decision_accuracy,confidence_calibration_score,throughput,status,decision,confidence_band,snapshot_window,notes,created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (role) query = query.eq('agent_role', role);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'agent scorecards query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/recent-hypotheses', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 25);

    const { data, error } = await applyTenantFilter(
      supabaseAdmin
        .from('research_hypotheses')
        .select('id,tenant_id,hypothesis_key,cluster_id,strategy_id,asset_type,symbol,hypothesis,status,decision,approval_status,confidence_band,notes,created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'recent hypotheses query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/coverage-gaps', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 25);
    const status = asText(req.query?.status);

    let query = applyTenantFilter(
      supabaseAdmin
        .from('coverage_gaps')
        .select('id,tenant_id,gap_key,strategy_id,asset_type,symbol,status,decision,approval_status,confidence_band,gap_type,priority,notes,created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'coverage gaps query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/recent-replay-results', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);
    const limit = normalizeLimit(req.query?.limit, 25);

    const { data, error } = await applyTenantFilter(
      supabaseAdmin
        .from('replay_results')
        .select('id,tenant_id,paper_trade_run_id,strategy_id,asset_type,symbol,status,decision,approval_status,confidence_band,trades_total,win_rate,net_pnl,max_drawdown,notes,created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      tenantId
    );

    if (error) return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'recent replay results query failed') });

    return reply.send({ ok: true, count: (data || []).length, items: data || [] });
  });

  fastify.get('/api/research/system-health', async (_req, reply) => {
    const since24h = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();

    const [
      signalsLast24h,
      signalsEnriched,
      aiProposals,
      riskDecisions,
      approvalPending,
      paperTrades,
      researchArtifacts,
      researchClaims,
      strategiesTracked,
      latestNormalizedSignal,
      latestRawSignal,
      latestResearch,
    ] = await Promise.all([
      safeCount('tv_raw_alerts', (q) => q.gte('created_at', since24h)),
      safeCount('tv_normalized_signals'),
      safeCount('reviewed_signal_proposals'),
      safeCount('risk_decisions'),
      safeCount('approval_queue', (q) => q.or('status.eq.queued,approval_status.eq.pending')),
      safeCount('paper_trade_runs'),
      safeCount('research_artifacts'),
      safeCount('research_claims'),
      safeCount('strategy_library'),
      safeLatestTimestamp('tv_normalized_signals'),
      safeLatestTimestamp('tv_raw_alerts'),
      safeLatestTimestamp('research_artifacts'),
    ]);

    const latestSignalAt = latestNormalizedSignal.value || latestRawSignal.value || null;

    return reply.send({
      signals_last_24h: signalsLast24h.count,
      signals_enriched: signalsEnriched.count,
      ai_proposals: aiProposals.count,
      risk_decisions: riskDecisions.count,
      approval_queue_pending: approvalPending.count,
      paper_trades: paperTrades.count,
      research_artifacts: researchArtifacts.count,
      research_claims: researchClaims.count,
      strategies_tracked: strategiesTracked.count,
      latest_signal_at: latestSignalAt,
      latest_research_at: latestResearch.value || null,
    });
  });

  fastify.get('/api/research/replay-performance', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const symbol = asText(req.query?.symbol);
    const strategyId = asText(req.query?.strategy_id);
    const limit = normalizeLimit(req.query?.limit, 200, 500);

    let query = supabaseAdmin
      .from('replay_results')
      .select('id,strategy_id,symbol,trades_total,win_rate,net_pnl,status,decision,meta,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (symbol) query = query.eq('symbol', symbol);
    if (strategyId) query = query.eq('strategy_id', strategyId);

    const { data, error } = await query;
    if (error) {
      if (!isMissingSchema(error)) {
        return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'replay performance query failed') });
      }

      return reply.send({
        trades_simulated: 0,
        wins: 0,
        losses: 0,
        win_rate: 0,
        avg_pnl_r: 0,
        avg_pnl_pct: 0,
        latest_run_at: null,
      });
    }

    const latestRunFallback = await safeLatestTimestamp('paper_trade_runs');
    const latestRunAt = toIsoStringOrNull(data?.[0]?.created_at) || latestRunFallback.value || null;

    return reply.send({
      ...buildReplayPerformance(data || []),
      latest_run_at: latestRunAt,
    });
  });

  fastify.get('/api/research/agent-leaderboard', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const limit = normalizeLimit(req.query?.limit, 20, 100);

    let { data, error } = await supabaseAdmin
      .from('v_research_agent_scorecards_latest')
      .select('agent_name,agent_role,score,decision_accuracy,confidence_calibration_score,throughput,status,decision,confidence_band,created_at')
      .order('score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error && isMissingSchema(error)) {
      ({ data, error } = await supabaseAdmin
        .from('agent_scorecards')
        .select('agent_name,agent_role,score,decision_accuracy,confidence_calibration_score,throughput,status,decision,confidence_band,created_at')
        .order('score', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(limit));
    }

    if (error) {
      if (isMissingSchema(error)) return reply.send({ ok: true, count: 0, items: [] });
      return reply.code(500).send({ ok: false, error: summarizeQueryError(error, 'agent leaderboard query failed') });
    }

    const rows = (data || []).map((row, idx) => ({
      rank: idx + 1,
      agent_name: row.agent_name || null,
      agent_role: row.agent_role || null,
      score: row.score ?? null,
      decision_accuracy: row.decision_accuracy ?? null,
      confidence_calibration_score: row.confidence_calibration_score ?? null,
      throughput: row.throughput ?? null,
      status: row.status || null,
      decision: row.decision || null,
      confidence_band: row.confidence_band || null,
      created_at: row.created_at || null,
    }));

    return reply.send({ ok: true, count: rows.length, items: rows });
  });

  fastify.get('/api/research/debug', async (_req, reply) => {
    const tables = [
      'tv_raw_alerts',
      'tv_normalized_signals',
      'reviewed_signal_proposals',
      'risk_decisions',
      'approval_queue',
      'proposal_outcomes',
      'paper_trade_runs',
      'replay_results',
      'research_artifacts',
      'research_claims',
      'strategy_library',
      'agent_scorecards',
      'research_hypotheses',
      'coverage_gaps',
    ];

    const checks = await Promise.all(
      tables.map(async (table) => {
        const [countRes, latestRes] = await Promise.all([
          safeCount(table),
          safeLatestTimestamp(table),
        ]);

        return {
          table,
          row_count: countRes.count,
          latest_created_at: latestRes.value,
          missing: Boolean(countRes.missing || latestRes.missing),
          error: countRes.error || latestRes.error,
        };
      })
    );

    const counts = {};
    const latest = {};
    const missing_tables = [];
    const warnings = [];

    for (const row of checks) {
      counts[row.table] = row.row_count;
      latest[row.table] = row.latest_created_at;
      if (row.missing) missing_tables.push(row.table);
      if (row.error) warnings.push(`${row.table}: ${asText(row.error.message || 'query_error')}`);
    }

    return reply.send({
      ok: true,
      generated_at: new Date().toISOString(),
      counts,
      latest,
      missing_tables,
      warnings,
    });
  });

  fastify.get('/api/research/summary', { preHandler: requireTenantScopeForInternalKey }, async (req, reply) => {
    const tenantId = normalizeTenantId(req);

    const strategyQ = applyTenantFilter(
      supabaseAdmin
        .from('v_research_strategy_rankings')
        .select('strategy_id,asset_type,symbol,timeframe,trades_total,win_rate,profit_factor,net_pnl,confidence_band,status,rank,created_at')
        .eq('asset_type', 'forex')
        .order('rank', { ascending: true })
        .limit(5),
      tenantId
    );

    const optionsQ = applyTenantFilter(
      supabaseAdmin
        .from('v_research_options_rankings')
        .select('strategy_id,symbol,underlying_symbol,structure_type,trades_total,win_rate,profit_factor,net_pnl,confidence_band,status,rank,created_at')
        .order('rank', { ascending: true })
        .limit(5),
      tenantId
    );

    const scoreQ = applyTenantFilter(
      supabaseAdmin
        .from('v_research_agent_scorecards_latest')
        .select('agent_name,agent_role,score,decision_accuracy,confidence_calibration_score,throughput,status,decision,confidence_band,created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      tenantId
    );

    const hypothesesQ = applyTenantFilter(
      supabaseAdmin
        .from('research_hypotheses')
        .select('id,hypothesis_key,strategy_id,asset_type,symbol,hypothesis,status,decision,confidence_band,created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      tenantId
    );

    const gapsQ = applyTenantFilter(
      supabaseAdmin
        .from('coverage_gaps')
        .select('id,gap_key,strategy_id,asset_type,symbol,status,decision,confidence_band,gap_type,priority,created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      tenantId
    );

    const [strategyRes, optionsRes, scoreRes, hypothesisRes, gapRes] = await Promise.all([
      strategyQ,
      optionsQ,
      scoreQ,
      hypothesesQ,
      gapsQ,
    ]);

    const firstError = strategyRes.error || optionsRes.error || scoreRes.error || hypothesisRes.error || gapRes.error;
    if (firstError) {
      return reply.code(500).send({ ok: false, error: summarizeQueryError(firstError, 'research summary query failed') });
    }

    const scoreRows = scoreRes.data || [];
    const analystAliases = ['analyst', 'research_analyst'];
    const riskAliases = ['risk_office', 'risk_governor', 'risk'];

    const analystRow = scoreRows.find((row) => isRoleMatch(row, analystAliases)) || null;
    const riskRow = scoreRows.find((row) => isRoleMatch(row, riskAliases)) || null;

    return reply.send({
      ok: true,
      top_forex_strategies: strategyRes.data || [],
      top_options_structures: optionsRes.data || [],
      analyst_score: analystRow?.score ?? null,
      risk_office_score: riskRow?.score ?? null,
      latest_hypotheses: hypothesisRes.data || [],
      latest_gaps: gapRes.data || [],
    });
  });
}
