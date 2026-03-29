#!/usr/bin/env node
import { supabaseAdmin } from '../src/supabase.js';

function isMissingSchema(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('could not find the table') && msg.includes('schema cache'))
  );
}

async function safeCount(table, buildQuery) {
  let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
  if (typeof buildQuery === 'function') query = buildQuery(query);

  const { count, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { count: 0, missing: true, warning: null };
    return { count: 0, missing: false, warning: String(error.message || `query failed: ${table}`) };
  }

  return { count: Number(count || 0), missing: false, warning: null };
}

function pushWarning(warnings, condition, message) {
  if (condition) warnings.push(message);
}

async function main() {
  console.log('Nexus Data Integrity Check');
  console.log('='.repeat(80));

  const [
    rawAlerts,
    normalizedSignals,
    reviewedProposals,
    approvedProposals,
    riskDecisions,
    approvalQueue,
    proposalOutcomes,
    replayResults,
    researchArtifacts,
    researchClaims,
  ] = await Promise.all([
    safeCount('tv_raw_alerts'),
    safeCount('tv_normalized_signals'),
    safeCount('reviewed_signal_proposals'),
    safeCount('reviewed_signal_proposals', (q) => q.eq('approval_status', 'approved')),
    safeCount('risk_decisions'),
    safeCount('approval_queue'),
    safeCount('proposal_outcomes'),
    safeCount('replay_results'),
    safeCount('research_artifacts'),
    safeCount('research_claims'),
  ]);

  const warnings = [];
  const scriptWarnings = [
    rawAlerts.warning,
    normalizedSignals.warning,
    reviewedProposals.warning,
    approvedProposals.warning,
    riskDecisions.warning,
    approvalQueue.warning,
    proposalOutcomes.warning,
    replayResults.warning,
    researchArtifacts.warning,
    researchClaims.warning,
  ].filter(Boolean);

  pushWarning(
    warnings,
    normalizedSignals.count > 0 && reviewedProposals.count === 0,
    'normalized signals exist but no reviewed proposals'
  );

  pushWarning(
    warnings,
    approvedProposals.count > 0 && approvalQueue.count === 0,
    'approved proposals exist but no approval queue rows'
  );

  pushWarning(
    warnings,
    riskDecisions.count > 0 && approvalQueue.count === 0,
    'risk decisions exist but approval queue is empty'
  );

  pushWarning(
    warnings,
    proposalOutcomes.count > 0 && replayResults.count === 0,
    'proposal outcomes exist but replay_results is empty'
  );

  pushWarning(
    warnings,
    replayResults.count === 0,
    'replay lab tables empty'
  );

  pushWarning(
    warnings,
    researchArtifacts.count > 0 && researchClaims.count === 0,
    'research claims missing despite research artifacts'
  );

  console.log(`tv_raw_alerts: ${rawAlerts.count}`);
  console.log(`tv_normalized_signals: ${normalizedSignals.count}`);
  console.log(`reviewed_signal_proposals: ${reviewedProposals.count}`);
  console.log(`risk_decisions: ${riskDecisions.count}`);
  console.log(`approval_queue: ${approvalQueue.count}`);
  console.log(`proposal_outcomes: ${proposalOutcomes.count}`);
  console.log(`replay_results: ${replayResults.count}`);
  console.log(`research_artifacts: ${researchArtifacts.count}`);
  console.log(`research_claims: ${researchClaims.count}`);

  console.log('-'.repeat(80));

  if (warnings.length === 0 && scriptWarnings.length === 0) {
    console.log('No continuity warnings detected.');
  }

  for (const warning of warnings) {
    console.log(`WARNING: ${warning}`);
  }

  for (const warning of scriptWarnings) {
    console.log(`WARNING: ${warning}`);
  }

  console.log('Integrity check complete (read-only, non-destructive).');
}

main().catch((err) => {
  console.error('Integrity check failed:', err?.message || err);
  process.exitCode = 1;
});
