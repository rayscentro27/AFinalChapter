import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import {
  getBusinessFoundationData,
  getCreditDomainData,
  resolveAuthedUserId,
  toHttpErrorBody,
} from './_shared/funding_foundation';

const QuerySchema = z.object({
  tenant_id: z.string().uuid().optional(),
});

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanLower(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function estimateFundingRange(input: {
  hasCreditReport: boolean;
  hasCreditAnalysis: boolean;
  businessReady: boolean;
  fundingReady: boolean;
  score: number | null;
  revenueHint: number | null;
}) {
  if (!input.hasCreditReport || !input.hasCreditAnalysis) {
    return { min: 0, max: 0, unlocked: false };
  }

  let min = 10000;
  let max = 30000;

  if (input.score) {
    if (input.score >= 720) {
      min = 30000;
      max = 90000;
    } else if (input.score >= 680) {
      min = 20000;
      max = 60000;
    } else if (input.score >= 640) {
      min = 15000;
      max = 45000;
    } else if (input.score >= 600) {
      min = 10000;
      max = 30000;
    } else {
      min = 5000;
      max = 20000;
    }
  } else if (input.revenueHint && input.revenueHint >= 150000) {
    min = 20000;
    max = 50000;
  }

  if (input.businessReady) {
    min += 5000;
    max += 10000;
  }
  if (input.fundingReady) {
    min += 5000;
    max += 15000;
  }

  if (input.revenueHint) {
    const revenueCap = Math.max(25000, Math.round(input.revenueHint * 0.35));
    max = Math.min(max, revenueCap);
    min = Math.min(min, Math.round(max * 0.65));
  }

  return {
    unlocked: true,
    min: clamp(Math.round(min / 5000) * 5000, 5000, 250000),
    max: clamp(Math.round(max / 5000) * 5000, 10000, 300000),
  };
}

function calculateReadinessScore(input: {
  hasCreditReport: boolean;
  hasCreditAnalysis: boolean;
  businessProgressPercent: number;
  fundingReady: boolean;
  hasApplications: boolean;
  hasApprovals: boolean;
}) {
  return clamp(
    Math.round(
      (input.hasCreditReport ? 20 : 0)
      + (input.hasCreditAnalysis ? 20 : 0)
      + Math.round((Math.max(input.businessProgressPercent, input.fundingReady ? 100 : 0) / 100) * 30)
      + (input.hasApplications ? 15 : 0)
      + (input.hasApprovals ? 15 : 0)
    ),
    0,
    100
  );
}

function difficultyTarget(level: string) {
  if (level === 'easy') return 35;
  if (level === 'medium') return 60;
  return 80;
}

function buildReason(code: string, detail: string) {
  return { code, detail };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const query = QuerySchema.parse(event.queryStringParameters || {});
    const userId = await resolveAuthedUserId(supabase as any);
    const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: query.tenant_id });

    const [credit, business, fundingProfileRes, fundingApplicationsRes, fundingResultsRes, grantMatchesRes, opportunityRes] = await Promise.all([
      getCreditDomainData(supabase as any, { tenantId, userId }),
      getBusinessFoundationData(supabase as any, { tenantId, userId }),
      supabase
        .from('funding_profiles')
        .select('current_stage,readiness_status,metadata')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('funding_applications')
        .select('id,decision_status,approved_amount_cents')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .limit(100),
      supabase
        .from('funding_results')
        .select('id,result_status,approved_amount_cents')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .limit(100),
      supabase
        .from('grant_matches')
        .select('id,grant_id,match_score,status')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .limit(200),
      supabase
        .from('business_opportunities')
        .select(`
          id,slug,name,category,opportunity_type,summary_md,difficulty_level,
          startup_cost_min_cents,startup_cost_max_cents,time_to_revenue_days,
          recommended_funding_min_cents,recommended_funding_max_cents,
          ideal_readiness_min,ideal_readiness_max,ideal_business_path,naics_tags,metadata,is_active,
          business_opportunity_grants(id,grant_id,notes_md)
        `)
        .eq('is_active', true)
        .order('name', { ascending: true }),
    ]);

    if (fundingProfileRes.error) throw new Error(fundingProfileRes.error.message || 'Unable to load funding profile.');
    if (fundingApplicationsRes.error) throw new Error(fundingApplicationsRes.error.message || 'Unable to load funding applications.');
    if (fundingResultsRes.error) throw new Error(fundingResultsRes.error.message || 'Unable to load funding results.');
    if (grantMatchesRes.error) throw new Error(grantMatchesRes.error.message || 'Unable to load grant matches.');
    if (opportunityRes.error) throw new Error(opportunityRes.error.message || 'Unable to load business opportunities.');

    const fundingProfile = fundingProfileRes.data || null;
    const applications = fundingApplicationsRes.data || [];
    const results = fundingResultsRes.data || [];
    const grantMatches = grantMatchesRes.data || [];
    const opportunities = opportunityRes.data || [];

    const businessCompleted = business.readiness.completed_steps || [];
    const businessMissing = business.readiness.missing_steps || [];
    const businessProgressPercent = Math.round((businessCompleted.length / Math.max(1, businessCompleted.length + businessMissing.length)) * 100);
    const hasCreditReport = Boolean(credit.latest_report);
    const hasCreditAnalysis = Boolean(credit.latest_analysis) || credit.recommendations.length > 0;
    const fundingReady = cleanLower(fundingProfile?.readiness_status) === 'ready';
    const hasApplications = applications.length > 0;
    const hasApprovals =
      applications.some((row: any) => cleanLower(row?.decision_status) === 'approved')
      || results.some((row: any) => cleanLower(row?.result_status) === 'approved');

    const readinessScore = calculateReadinessScore({
      hasCreditReport,
      hasCreditAnalysis,
      businessProgressPercent,
      fundingReady,
      hasApplications,
      hasApprovals,
    });

    const revenueHint = Number((fundingProfile?.metadata as any)?.monthly_revenue || (fundingProfile?.metadata as any)?.annual_revenue || 0) || null;
    const score = Number((credit.latest_analysis as any)?.overall_score || 0) || null;
    const estimatedFunding = estimateFundingRange({
      hasCreditReport,
      hasCreditAnalysis,
      businessReady: business.readiness.ready,
      fundingReady,
      score,
      revenueHint,
    });

    const currentNaics = cleanLower(business.profile?.naics_code);
    const currentPath = cleanLower(business.readiness.path);
    const grantCount = grantMatches.length;
    const grantAverageScore = grantCount > 0
      ? Math.round(grantMatches.reduce((sum: number, row: any) => sum + Number(row?.match_score || 0), 0) / grantCount)
      : 0;

    const ranked = opportunities.map((opportunity: any) => {
      const reasons: Array<{ code: string; detail: string }> = [];

      let readinessFit = 10;
      if (readinessScore >= Number(opportunity.ideal_readiness_min || 0) && readinessScore <= Number(opportunity.ideal_readiness_max || 100)) {
        readinessFit = 25;
        reasons.push(buildReason('readiness_fit', 'Current readiness is inside the ideal opportunity range.'));
      } else {
        const distance = Math.min(
          Math.abs(readinessScore - Number(opportunity.ideal_readiness_min || 0)),
          Math.abs(readinessScore - Number(opportunity.ideal_readiness_max || 100))
        );
        readinessFit = clamp(25 - Math.round(distance / 3), 4, 20);
        reasons.push(buildReason('readiness_gap', 'Opportunity is still reachable, but readiness is not yet ideal.'));
      }

      let fundingFit = estimatedFunding.unlocked ? 12 : 4;
      if (estimatedFunding.unlocked) {
        const startupMax = Number(opportunity.startup_cost_max_cents || 0) / 100;
        const recommendedMax = Number(opportunity.recommended_funding_max_cents || 0) / 100;
        if (estimatedFunding.max >= startupMax) {
          fundingFit += 12;
          reasons.push(buildReason('funding_fit', 'Estimated funding range can realistically support the startup cost.'));
        } else {
          reasons.push(buildReason('funding_gap', 'Startup cost may still be high for the current estimated funding range.'));
        }
        if (estimatedFunding.max >= recommendedMax * 0.5) {
          fundingFit += 6;
        }
      } else {
        reasons.push(buildReason('funding_locked', 'Funding estimate is still gated by missing readiness data.'));
      }

      const difficulty = cleanLower(opportunity.difficulty_level);
      const difficultyFit = clamp(22 - Math.abs(readinessScore - difficultyTarget(difficulty)) / 2, 6, 22);
      if (difficulty === 'easy') {
        reasons.push(buildReason('difficulty_fit', 'This opportunity is easier to start while readiness is still building.'));
      }

      let pathBoost = 0;
      if (!opportunity.ideal_business_path || cleanLower(opportunity.ideal_business_path) === currentPath) {
        pathBoost = 8;
        reasons.push(buildReason('path_fit', 'The opportunity matches the current business path.'));
      }

      let naicsBoost = 0;
      if (Array.isArray(opportunity.naics_tags) && currentNaics && opportunity.naics_tags.map((tag: string) => cleanLower(tag)).includes(currentNaics)) {
        naicsBoost = 10;
        reasons.push(buildReason('naics_fit', 'The opportunity aligns with the current NAICS direction.'));
      }

      const hasGrantConnection = Array.isArray(opportunity.business_opportunity_grants) && opportunity.business_opportunity_grants.length > 0;
      const grantBoost = hasGrantConnection ? clamp(8 + Math.round(grantAverageScore / 20), 8, 18) : 0;
      if (hasGrantConnection) {
        reasons.push(buildReason('grant_boost', 'This opportunity has related grant connection points.'));
      }

      let startupPenalty = 0;
      const startupMin = Number(opportunity.startup_cost_min_cents || 0) / 100;
      if (estimatedFunding.unlocked && estimatedFunding.max > 0 && startupMin > estimatedFunding.max) {
        startupPenalty = 18;
        reasons.push(buildReason('startup_cost_penalty', 'Startup cost is high relative to the current funding estimate.'));
      } else if (!business.readiness.ready && Number(opportunity.startup_cost_max_cents || 0) > 700000) {
        startupPenalty = 10;
        reasons.push(buildReason('startup_cost_penalty', 'This opportunity may be too capital-heavy for the current readiness stage.'));
      }

      const matchScore = clamp(Math.round(readinessFit + fundingFit + difficultyFit + pathBoost + naicsBoost + grantBoost - startupPenalty), 0, 100);

      return {
        opportunity,
        match_score: matchScore,
        funding_fit_score: fundingFit,
        difficulty_fit_score: Math.round(difficultyFit),
        readiness_fit_score: readinessFit,
        grant_boost_score: grantBoost,
        startup_cost_penalty: startupPenalty,
        reasons,
        estimated_funding_min_cents: estimatedFunding.unlocked ? estimatedFunding.min * 100 : null,
        estimated_funding_max_cents: estimatedFunding.unlocked ? estimatedFunding.max * 100 : null,
        source_snapshot: {
          readiness_score: readinessScore,
          business_progress_percent: businessProgressPercent,
          current_stage: fundingProfile?.current_stage || 'business_foundation',
          current_naics: business.profile?.naics_code || null,
          current_path: business.readiness.path,
          grant_matches: grantCount,
        },
      };
    }).sort((left, right) => right.match_score - left.match_score);

    for (const row of ranked) {
      await supabase
        .from('client_opportunity_matches')
        .upsert({
          tenant_id: tenantId,
          user_id: userId,
          opportunity_id: row.opportunity.id,
          status: 'recommended',
          match_score: row.match_score,
          funding_fit_score: row.funding_fit_score,
          difficulty_fit_score: row.difficulty_fit_score,
          readiness_fit_score: row.readiness_fit_score,
          grant_boost_score: row.grant_boost_score,
          startup_cost_penalty: row.startup_cost_penalty,
          estimated_funding_min_cents: row.estimated_funding_min_cents,
          estimated_funding_max_cents: row.estimated_funding_max_cents,
          reasons: row.reasons,
          source_snapshot: row.source_snapshot,
        } as any, { onConflict: 'tenant_id,user_id,opportunity_id' });
    }

    const storedMatchesRes = await supabase
      .from('client_opportunity_matches')
      .select(`
        id,tenant_id,user_id,opportunity_id,status,match_score,funding_fit_score,difficulty_fit_score,
        readiness_fit_score,grant_boost_score,startup_cost_penalty,estimated_funding_min_cents,estimated_funding_max_cents,
        reasons,source_snapshot,created_at,updated_at,
        business_opportunities(
          id,slug,name,category,opportunity_type,summary_md,difficulty_level,
          startup_cost_min_cents,startup_cost_max_cents,time_to_revenue_days,
          recommended_funding_min_cents,recommended_funding_max_cents,metadata,
          business_opportunity_requirements(id,requirement_key,label,description,is_required,sort_order),
          business_opportunity_steps(id,step_key,label,description,action_path,sort_order,is_required,metadata),
          business_opportunity_grants(id,grant_id,notes_md)
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('match_score', { ascending: false })
      .limit(12);

    if (storedMatchesRes.error) throw new Error(storedMatchesRes.error.message || 'Unable to load stored opportunity matches.');

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      readiness_score: readinessScore,
      estimated_funding: estimatedFunding,
      matches: storedMatchesRes.data || [],
      matching_rules: {
        signals: ['estimated_funding_range', 'readiness_score', 'business_setup_progress', 'current_journey_stage', 'preferences_if_available'],
        scoring: ['funding_fit', 'difficulty_fit', 'grant_boost', 'startup_cost_penalty'],
      },
    });
  } catch (error) {
    const err = toHttpErrorBody(error);
    return json(err.statusCode, err.body);
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
