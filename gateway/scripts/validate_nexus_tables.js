#!/usr/bin/env node
import { supabaseAdmin } from '../src/supabase.js';

const TABLES = [
  'tv_raw_alerts',
  'tv_normalized_signals',
  'market_price_snapshots',
  'reviewed_signal_proposals',
  'risk_decisions',
  'approval_queue',
  'proposal_outcomes',
  'strategy_performance',
  'options_strategy_performance',
  'agent_scorecards',
  'paper_trade_runs',
  'replay_results',
  'confidence_calibration',
  'strategy_optimizations',
  'strategy_variants',
  'research_clusters',
  'research_hypotheses',
  'coverage_gaps',
  'research_briefs',
  'research_artifacts',
  'research_claims',
  'strategy_library',
];

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

function pad(text, width) {
  const value = String(text);
  if (value.length >= width) return value;
  return `${value}${' '.repeat(width - value.length)}`;
}

async function probeTable(table) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (error) {
    if (isMissingSchema(error)) {
      return {
        table,
        exists: false,
        count: 0,
        latest: null,
        warning: null,
      };
    }

    return {
      table,
      exists: false,
      count: 0,
      latest: null,
      warning: String(error.message || 'table probe failed'),
    };
  }

  const latestRes = await supabaseAdmin
    .from(table)
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  let latest = null;
  let warning = null;

  if (!latestRes.error) {
    latest = latestRes.data?.[0]?.created_at || null;
  } else if (!isMissingSchema(latestRes.error)) {
    warning = String(latestRes.error.message || 'created_at lookup failed');
  }

  return {
    table,
    exists: true,
    count: Number(count || 0),
    latest,
    warning,
  };
}

async function main() {
  console.log('Nexus Table Validation');
  console.log('='.repeat(80));

  const results = await Promise.all(TABLES.map((table) => probeTable(table)));

  let existing = 0;
  let missing = 0;

  for (const row of results) {
    if (row.exists) existing += 1;
    else missing += 1;

    const status = row.exists ? 'OK' : 'MISSING';
    console.log(
      `${pad(status, 8)} ${pad(row.table, 30)} count=${pad(row.count, 8)} latest=${row.latest || 'n/a'}`
    );

    if (row.warning) {
      console.log(`  warning: ${row.warning}`);
    }
  }

  console.log('-'.repeat(80));
  console.log(`Summary: ${existing} existing, ${missing} missing, ${TABLES.length} checked.`);

  if (missing > 0) {
    console.log('Note: Missing tables may be expected before all migrations/workflows are fully applied.');
  }
}

main().catch((err) => {
  console.error('Validation script failed:', err?.message || err);
  process.exitCode = 1;
});
