import type { SupabaseClient } from '@supabase/supabase-js';

export type FundingDecisionStatus = 'submitted' | 'approved' | 'denied' | 'pending' | 'cancelled';
export type PortalTaskStatus = 'pending' | 'completed';

export type FundingReadiness = {
  ready: boolean;
  blockers: string[];
  recommended_next_steps: string[];
  context: {
    has_credit_report: boolean;
    has_credit_analysis: boolean;
    business_path: string | null;
    completed_business_steps: string[];
    missing_business_steps: string[];
    stage: string;
  };
};

export type FundingRecommendation = {
  ready: boolean;
  current_stage: string;
  top_recommendation: {
    key: string;
    title: string;
    action: string;
  } | null;
  blockers: string[];
  reasoning_summary: string;
  follow_up_actions: string[];
};

export type PortalTaskBoard = {
  top_task: any | null;
  urgent: any[];
  recommended: any[];
  completed: any[];
};

type CreditReportRow = {
  id: string;
  created_at: string | null;
  report_status: string | null;
  bureau: string | null;
  report_source: string | null;
};

type CreditAnalysisRow = {
  id: string;
  credit_report_id: string | null;
  analysis_status: string | null;
  overall_score: number | null;
  utilization_pct: number | null;
  inquiry_count: number | null;
  derogatory_count: number | null;
  analysis_notes: string | null;
  analysis_summary: Record<string, unknown> | null;
  created_at: string | null;
};

type DisputeRecommendationRow = {
  id: string;
  credit_analysis_id: string | null;
  recommendation_status: string | null;
  priority: string | null;
  item_key: string | null;
  title: string | null;
  reasoning: string | null;
  recommended_action: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

type BusinessProfileRow = {
  id: string;
  business_path: string | null;
  legal_name: string | null;
  entity_type: string | null;
  ein: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_website: string | null;
  naics_code: string | null;
  profile_status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

type BusinessProgressRow = {
  id: string;
  step_key: string;
  step_status: string;
  is_required: boolean;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
};

type FundingProfileRow = {
  id: string;
  current_stage: string | null;
  readiness_status: string | null;
  profile_status: string | null;
  last_recommendation: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
};

type FundingApplicationRow = {
  id: string;
  strategy_step_id: string | null;
  provider_name: string | null;
  product_name: string | null;
  bureau_used: string | null;
  submitted_at: string | null;
  decision_status: string | null;
  approved_amount_cents: number | string | null;
  inquiry_detected: boolean | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

type FundingResultRow = {
  id: string;
  funding_application_id: string | null;
  result_status: string | null;
  approved_amount_cents: number | string | null;
  result_notes: string | null;
  outcome_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

type FundingStrategyStepRow = {
  id: string;
  step_key: string;
  step_title: string;
  step_description: string | null;
  step_status: string;
  sort_order: number | null;
  metadata: Record<string, unknown> | null;
};

type FundingOutcomeRow = {
  id: string;
  outcome_status: string | null;
  approved_amount_cents: number | string | null;
  approval_date: string | null;
  provider_name: string | null;
  product_type: string | null;
  created_at: string | null;
};

type LetterRow = {
  id: string;
  title: string | null;
  status: string | null;
  letter_status: string | null;
  output_format: string | null;
  metadata: Record<string, unknown> | null;
  document_upload_id?: string | null;
  created_at: string | null;
};

const NEW_BUSINESS_REQUIRED_STEPS = [
  'llc_setup',
  'ein_setup',
  'business_address',
  'business_phone',
  'business_website',
  'naics_classification',
  'business_bank_account',
];

const EXISTING_BUSINESS_REQUIRED_STEPS = [
  'review_current_setup',
  'update_business_address',
  'align_irs_ein',
  'update_bank_records',
  'website_phone_consistency',
  'final_consistency_check',
];

function safeObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function dollarsToCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function normalizeDecisionStatus(value: unknown): FundingDecisionStatus {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'approved') return 'approved';
  if (s === 'denied') return 'denied';
  if (s === 'pending') return 'pending';
  if (s === 'cancelled') return 'cancelled';
  return 'submitted';
}

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function shouldIgnoreRelationError(error: any): boolean {
  return String(error?.code || '') === '42P01';
}

function withStatus(error: unknown, fallback = 400): { statusCode: number; message: string } {
  const statusCode = Number((error as any)?.statusCode) || fallback;
  return {
    statusCode,
    message: String((error as any)?.message || 'Bad Request'),
  };
}

async function resolveSingle<T>(query: PromiseLike<{ data: any; error: any }>): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    if (shouldIgnoreRelationError(error)) return null;
    throw new Error(error.message || 'Query failed');
  }
  return (data || null) as T | null;
}

async function resolveMany<T>(query: PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    if (shouldIgnoreRelationError(error)) return [];
    throw new Error(error.message || 'Query failed');
  }
  return (data || []) as T[];
}

export async function resolveAuthedUserId(supabase: SupabaseClient): Promise<string> {
  const authRes = await supabase.auth.getUser();
  const userId = String(authRes.data.user?.id || '').trim();
  if (!userId) {
    const err: any = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  return userId;
}

export function toHttpErrorBody(error: unknown) {
  const details = withStatus(error, 400);
  return {
    statusCode: details.statusCode,
    body: { error: details.message },
  };
}

export async function getCreditDomainData(
  supabase: SupabaseClient,
  params: { tenantId: string; userId: string }
) {
  const [reports, analyses, recs, letters] = await Promise.all([
    resolveMany<CreditReportRow>(
      supabase
        .from('credit_reports')
        .select('id,created_at,report_status,bureau,report_source')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .order('created_at', { ascending: false })
        .limit(10)
    ),
    resolveMany<CreditAnalysisRow>(
      supabase
        .from('credit_analysis')
        .select('id,credit_report_id,analysis_status,overall_score,utilization_pct,inquiry_count,derogatory_count,analysis_notes,analysis_summary,created_at')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .order('created_at', { ascending: false })
        .limit(10)
    ),
    resolveMany<DisputeRecommendationRow>(
      supabase
        .from('dispute_recommendations')
        .select('id,credit_analysis_id,recommendation_status,priority,item_key,title,reasoning,recommended_action,metadata,created_at')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .order('created_at', { ascending: false })
        .limit(25)
    ),
    resolveMany<LetterRow>(
      supabase
        .from('dispute_letters')
        .select('*')
        .eq('tenant_id', params.tenantId)
        .order('created_at', { ascending: false })
        .limit(25)
    ),
  ]);

  return {
    reports,
    latest_report: reports[0] || null,
    analyses,
    latest_analysis: analyses[0] || null,
    recommendations: recs,
    letters: letters.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.letter_status || row.status,
      output_format: row.output_format,
      metadata: safeObject(row.metadata),
      document_upload_id: (row as any).document_upload_id || null,
      created_at: row.created_at,
    })),
  };
}

function normalizeBusinessPath(path: unknown): 'new_business' | 'existing_business_optimization' | null {
  const value = String(path || '').trim().toLowerCase();
  if (value === 'new_business') return 'new_business';
  if (value === 'existing_business_optimization') return 'existing_business_optimization';
  return null;
}

function deriveBusinessRequiredSteps(path: string | null): string[] {
  if (path === 'new_business') return NEW_BUSINESS_REQUIRED_STEPS;
  if (path === 'existing_business_optimization') return EXISTING_BUSINESS_REQUIRED_STEPS;
  return ['select_business_path'];
}

export function computeBusinessReadiness(input: {
  profile: BusinessProfileRow | null;
  progress: BusinessProgressRow[];
  tax: Record<string, unknown> | null;
  banking: Record<string, unknown> | null;
  classification: Record<string, unknown> | null;
  optimization: Record<string, unknown> | null;
}) {
  const profile = input.profile;
  const path = normalizeBusinessPath(profile?.business_path || null);
  const required = deriveBusinessRequiredSteps(path);
  const progressMap = new Map<string, BusinessProgressRow>();

  for (const row of input.progress) {
    progressMap.set(String(row.step_key), row);
  }

  const completedSteps: string[] = [];
  const missingSteps: string[] = [];

  for (const step of required) {
    if (step === 'select_business_path') {
      if (path) completedSteps.push(step);
      else missingSteps.push(step);
      continue;
    }

    const row = progressMap.get(step);
    if (row && String(row.step_status) === 'completed') {
      completedSteps.push(step);
    } else {
      missingSteps.push(step);
    }
  }

  if (path === 'new_business') {
    if (!profile?.ein) missingSteps.push('ein_setup');
    if (!profile?.business_address) missingSteps.push('business_address');
    if (!profile?.business_phone) missingSteps.push('business_phone');
    if (!profile?.business_website) missingSteps.push('business_website');
    if (!profile?.naics_code) missingSteps.push('naics_classification');
  }

  const uniqueMissing = Array.from(new Set(missingSteps));
  const blockers = uniqueMissing.map((step) => {
    if (step === 'select_business_path') return 'Select new business or existing business optimization path.';
    if (step === 'ein_setup') return 'Complete EIN setup/alignment.';
    if (step === 'business_address') return 'Complete business address setup/alignment.';
    if (step === 'business_phone') return 'Complete business phone setup/alignment.';
    if (step === 'business_website') return 'Complete business website setup/alignment.';
    if (step === 'naics_classification') return 'Complete NAICS/business classification step.';
    if (step === 'business_bank_account') return 'Complete business bank account setup.';
    if (step === 'align_irs_ein') return 'Align IRS/EIN records.';
    if (step === 'update_bank_records') return 'Update business bank records.';
    if (step === 'website_phone_consistency') return 'Finish website/phone consistency review.';
    if (step === 'final_consistency_check') return 'Complete final consistency check.';
    return `Complete business step: ${step}.`;
  });

  return {
    ready: uniqueMissing.length === 0,
    path,
    completed_steps: Array.from(new Set(completedSteps)),
    missing_steps: uniqueMissing,
    blockers,
    supporting: {
      tax: safeObject(input.tax),
      banking: safeObject(input.banking),
      classification: safeObject(input.classification),
      optimization: safeObject(input.optimization),
    },
  };
}

export async function getBusinessFoundationData(
  supabase: SupabaseClient,
  params: { tenantId: string; userId: string }
) {
  const [profile, progress, taxProfile, bankingProfile, classificationProfile, optimizationProfile] = await Promise.all([
    resolveSingle<BusinessProfileRow>(
      supabase
        .from('business_profiles')
        .select('id,business_path,legal_name,entity_type,ein,business_address,business_phone,business_website,naics_code,profile_status,metadata,created_at,updated_at')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .maybeSingle()
    ),
    resolveMany<BusinessProgressRow>(
      supabase
        .from('business_setup_progress')
        .select('id,step_key,step_status,is_required,notes,metadata,updated_at')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .order('updated_at', { ascending: false })
        .limit(100)
    ),
    resolveSingle<any>(
      supabase
        .from('business_tax_profile')
        .select('*')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .maybeSingle()
    ),
    resolveSingle<any>(
      supabase
        .from('business_banking_profile')
        .select('*')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .maybeSingle()
    ),
    resolveSingle<any>(
      supabase
        .from('business_classification')
        .select('*')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .maybeSingle()
    ),
    resolveSingle<any>(
      supabase
        .from('business_optimization_profile')
        .select('*')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .maybeSingle()
    ),
  ]);

  const readiness = computeBusinessReadiness({
    profile,
    progress,
    tax: taxProfile,
    banking: bankingProfile,
    classification: classificationProfile,
    optimization: optimizationProfile,
  });

  return {
    profile,
    progress,
    tax_profile: taxProfile,
    banking_profile: bankingProfile,
    classification_profile: classificationProfile,
    optimization_profile: optimizationProfile,
    readiness,
  };
}

export async function setBusinessPath(
  supabase: SupabaseClient,
  params: { tenantId: string; userId: string; businessPath: 'new_business' | 'existing_business_optimization' }
) {
  const payload = {
    tenant_id: params.tenantId,
    user_id: params.userId,
    business_path: params.businessPath,
    profile_status: 'in_progress',
  };

  const { error } = await supabase
    .from('business_profiles')
    .upsert(payload as any, { onConflict: 'tenant_id,user_id' });

  if (error && !shouldIgnoreRelationError(error)) {
    throw new Error(error.message || 'Unable to save business path');
  }

  const stepPayload = {
    tenant_id: params.tenantId,
    user_id: params.userId,
    step_key: 'select_business_path',
    step_status: 'completed',
    is_required: true,
    notes: `Selected path: ${params.businessPath}`,
  };

  const stepRes = await supabase
    .from('business_setup_progress')
    .upsert(stepPayload as any, { onConflict: 'tenant_id,user_id,step_key' });

  if (stepRes.error && !shouldIgnoreRelationError(stepRes.error)) {
    throw new Error(stepRes.error.message || 'Unable to update business path task');
  }

  return getBusinessFoundationData(supabase, {
    tenantId: params.tenantId,
    userId: params.userId,
  });
}

export async function setBusinessProgress(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    stepKey: string;
    stepStatus: 'not_started' | 'in_progress' | 'completed' | 'blocked';
    isRequired?: boolean;
    notes?: string | null;
  }
) {
  const payload = {
    tenant_id: params.tenantId,
    user_id: params.userId,
    step_key: params.stepKey,
    step_status: params.stepStatus,
    is_required: params.isRequired !== false,
    notes: params.notes || null,
  };

  const { error } = await supabase
    .from('business_setup_progress')
    .upsert(payload as any, { onConflict: 'tenant_id,user_id,step_key' });

  if (error && !shouldIgnoreRelationError(error)) {
    throw new Error(error.message || 'Unable to update business progress');
  }

  return getBusinessFoundationData(supabase, {
    tenantId: params.tenantId,
    userId: params.userId,
  });
}

export async function setBusinessProfile(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    legalName?: string | null;
    entityType?: string | null;
    ein?: string | null;
    businessAddress?: string | null;
    businessPhone?: string | null;
    businessWebsite?: string | null;
    naicsCode?: string | null;
    businessEmail?: string | null;
    missionStatement?: string | null;
    businessPlanSummary?: string | null;
    bankName?: string | null;
    accountType?: string | null;
    profileStatus?: 'not_started' | 'in_progress' | 'ready' | 'completed' | null;
    metadataPatch?: Record<string, unknown> | null;
  }
) {
  const existing = await resolveSingle<BusinessProfileRow>(
    supabase
      .from('business_profiles')
      .select('id,business_path,legal_name,entity_type,ein,business_address,business_phone,business_website,naics_code,profile_status,metadata,created_at,updated_at')
      .eq('tenant_id', params.tenantId)
      .eq('user_id', params.userId)
      .maybeSingle()
  );

  const mergedMetadata = {
    ...safeObject(existing?.metadata),
    ...safeObject(params.metadataPatch),
    ...(params.businessEmail !== undefined ? { business_email: params.businessEmail || null } : {}),
    ...(params.missionStatement !== undefined ? { mission_statement: params.missionStatement || null } : {}),
    ...(params.businessPlanSummary !== undefined ? { business_plan_summary: params.businessPlanSummary || null } : {}),
  };

  const profilePayload = {
    tenant_id: params.tenantId,
    user_id: params.userId,
    legal_name: params.legalName ?? existing?.legal_name ?? null,
    entity_type: params.entityType ?? existing?.entity_type ?? null,
    ein: params.ein ?? existing?.ein ?? null,
    business_address: params.businessAddress ?? existing?.business_address ?? null,
    business_phone: params.businessPhone ?? existing?.business_phone ?? null,
    business_website: params.businessWebsite ?? existing?.business_website ?? null,
    naics_code: params.naicsCode ?? existing?.naics_code ?? null,
    profile_status: params.profileStatus ?? existing?.profile_status ?? 'in_progress',
    metadata: mergedMetadata,
  };

  const profileRes = await supabase
    .from('business_profiles')
    .upsert(profilePayload as any, { onConflict: 'tenant_id,user_id' });

  if (profileRes.error && !shouldIgnoreRelationError(profileRes.error)) {
    throw new Error(profileRes.error.message || 'Unable to update business foundation profile');
  }

  if (params.ein !== undefined) {
    const taxRes = await supabase
      .from('business_tax_profile')
      .upsert({
        tenant_id: params.tenantId,
        user_id: params.userId,
        ein: params.ein || null,
        irs_alignment_status: params.ein ? 'completed' : 'in_progress',
        status: params.ein ? 'completed' : 'in_progress',
        tax_metadata: { source: 'portal_business_foundation' },
      } as any, { onConflict: 'tenant_id,user_id' });
    if (taxRes.error && !shouldIgnoreRelationError(taxRes.error)) {
      throw new Error(taxRes.error.message || 'Unable to update business tax profile');
    }
  }

  if (params.naicsCode !== undefined) {
    const classificationRes = await supabase
      .from('business_classification')
      .upsert({
        tenant_id: params.tenantId,
        user_id: params.userId,
        naics_code: params.naicsCode || null,
        classification_status: params.naicsCode ? 'completed' : 'in_progress',
        metadata: { source: 'portal_business_foundation' },
      } as any, { onConflict: 'tenant_id,user_id' });
    if (classificationRes.error && !shouldIgnoreRelationError(classificationRes.error)) {
      throw new Error(classificationRes.error.message || 'Unable to update business classification');
    }
  }

  if (params.bankName !== undefined || params.accountType !== undefined) {
    const bankingRes = await supabase
      .from('business_banking_profile')
      .upsert({
        tenant_id: params.tenantId,
        user_id: params.userId,
        bank_name: params.bankName ?? null,
        account_type: params.accountType ?? null,
        bank_profile_status: params.bankName || params.accountType ? 'completed' : 'in_progress',
        metadata: { source: 'portal_business_foundation' },
      } as any, { onConflict: 'tenant_id,user_id' });
    if (bankingRes.error && !shouldIgnoreRelationError(bankingRes.error)) {
      throw new Error(bankingRes.error.message || 'Unable to update business banking profile');
    }
  }

  return getBusinessFoundationData(supabase, {
    tenantId: params.tenantId,
    userId: params.userId,
  });
}

function inferFundingStage(input: {
  approvedCount: number;
  pendingCount: number;
  readinessReady: boolean;
  businessReady: boolean;
  hasCreditAnalysis: boolean;
  explicitStage: string | null;
}) {
  if (input.explicitStage && input.explicitStage.trim().length > 0) {
    return input.explicitStage;
  }
  if (input.approvedCount > 0) return 'post_funding_capital';
  if (input.pendingCount > 0) return 'application_loop';
  if (input.readinessReady) return 'funding_roadmap';
  if (!input.businessReady) return 'business_foundation';
  if (!input.hasCreditAnalysis) return 'credit_optimization';
  return 'funding_roadmap';
}

function deriveFundingReadiness(input: {
  credit: Awaited<ReturnType<typeof getCreditDomainData>>;
  business: Awaited<ReturnType<typeof getBusinessFoundationData>>;
  stage: string;
}): FundingReadiness {
  const blockers: string[] = [];
  const recommendations: string[] = [];

  const hasCreditReport = Boolean(input.credit.latest_report);
  const hasCreditAnalysis = Boolean(input.credit.latest_analysis);

  if (!hasCreditReport) blockers.push('Upload your latest credit report.');
  if (hasCreditReport && !hasCreditAnalysis) blockers.push('Credit analysis is not available yet.');

  for (const blocker of input.business.readiness.blockers) {
    blockers.push(blocker);
  }

  if (!hasCreditReport) {
    recommendations.push('Upload credit report to unlock dispute and readiness analysis.');
  }

  if (hasCreditAnalysis && input.credit.recommendations.length > 0) {
    recommendations.push('Review dispute recommendations before next funding application.');
  }

  if (!input.business.readiness.ready) {
    recommendations.push('Complete Business Foundation blockers to become funding-ready.');
  }

  if (hasCreditAnalysis && input.business.readiness.ready) {
    recommendations.push('Proceed to Funding Roadmap and log your next application step.');
  }

  return {
    ready: blockers.length === 0,
    blockers,
    recommended_next_steps: Array.from(new Set(recommendations)),
    context: {
      has_credit_report: hasCreditReport,
      has_credit_analysis: hasCreditAnalysis,
      business_path: input.business.readiness.path,
      completed_business_steps: input.business.readiness.completed_steps,
      missing_business_steps: input.business.readiness.missing_steps,
      stage: input.stage,
    },
  };
}

function nextRecommendationFromState(input: {
  readiness: FundingReadiness;
  currentStage: string;
  applications: FundingApplicationRow[];
  results: FundingResultRow[];
  strategySteps: FundingStrategyStepRow[];
}): FundingRecommendation {
  if (!input.readiness.ready) {
    return {
      ready: false,
      current_stage: input.currentStage,
      top_recommendation: {
        key: 'resolve_blockers',
        title: 'Resolve Funding Blockers',
        action: 'Complete blocker tasks in Action Center before submitting the next application.',
      },
      blockers: input.readiness.blockers,
      reasoning_summary: 'Funding readiness is blocked by missing credit/business prerequisites.',
      follow_up_actions: input.readiness.recommended_next_steps,
    };
  }

  const latestApp = input.applications[0] || null;
  const latestResult = input.results[0] || null;
  const activeStep = input.strategySteps.find((step) => step.step_status === 'active') || null;
  const pendingStep = input.strategySteps.find((step) => step.step_status === 'pending') || null;

  if (latestApp && ['submitted', 'pending'].includes(String(latestApp.decision_status || ''))) {
    return {
      ready: true,
      current_stage: input.currentStage,
      top_recommendation: {
        key: 'log_application_outcome',
        title: 'Log Latest Application Outcome',
        action: 'Capture the decision status so the roadmap can calculate your next best move.',
      },
      blockers: [],
      reasoning_summary: 'An application is in-flight. The next deterministic action is to log the outcome.',
      follow_up_actions: ['Open Funding Roadmap', 'Submit apply-log with approved/denied/pending result'],
    };
  }

  if (latestResult && String(latestResult.result_status || '') === 'denied') {
    return {
      ready: true,
      current_stage: input.currentStage,
      top_recommendation: {
        key: 'post_denial_sequence',
        title: 'Run Post-Denial Sequence',
        action: 'Pause new submissions, review inquiry density, then move to the next strategy step.',
      },
      blockers: [],
      reasoning_summary: 'Recent denial detected; sequence control and inquiry pacing should happen first.',
      follow_up_actions: [
        'Review denial notes and bureau_used fields',
        'Advance to next strategy step only after blocker review',
      ],
    };
  }

  if (activeStep || pendingStep) {
    const step = activeStep || pendingStep;
    return {
      ready: true,
      current_stage: input.currentStage,
      top_recommendation: {
        key: step ? step.step_key : 'next_strategy_step',
        title: step ? step.step_title : 'Execute Next Strategy Step',
        action: step?.step_description || 'Execute the next deterministic funding step and log result immediately.',
      },
      blockers: [],
      reasoning_summary: 'Funding profile is ready. Strategy step sequencing is now the primary guide.',
      follow_up_actions: ['Apply via recommended provider', 'Log outcome in apply-log flow'],
    };
  }

  return {
    ready: true,
    current_stage: input.currentStage,
    top_recommendation: {
      key: 'start_application_loop',
      title: 'Start Next Application Loop',
      action: 'Submit next guided application and log the result to continue sequencing.',
    },
    blockers: [],
    reasoning_summary: 'No active blockers or in-flight outcomes. Move forward with the next application loop.',
    follow_up_actions: ['Open Funding Roadmap', 'Use apply-log after submission'],
  };
}

export async function getFundingRoadmapData(
  supabase: SupabaseClient,
  params: { tenantId: string; userId: string; reconcileTasks?: boolean }
) {
  const [credit, business, profile, strategySteps, applications, results, legacyOutcomes] = await Promise.all([
    getCreditDomainData(supabase, params),
    getBusinessFoundationData(supabase, params),
    resolveSingle<FundingProfileRow>(
      supabase
        .from('funding_profiles')
        .select('id,current_stage,readiness_status,profile_status,last_recommendation,metadata,updated_at')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .maybeSingle()
    ),
    resolveMany<FundingStrategyStepRow>(
      supabase
        .from('funding_strategy_steps')
        .select('id,step_key,step_title,step_description,step_status,sort_order,metadata')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .order('sort_order', { ascending: true })
        .limit(100)
    ),
    resolveMany<FundingApplicationRow>(
      supabase
        .from('funding_applications')
        .select('id,strategy_step_id,provider_name,product_name,bureau_used,submitted_at,decision_status,approved_amount_cents,inquiry_detected,notes,metadata,created_at')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .order('created_at', { ascending: false })
        .limit(50)
    ),
    resolveMany<FundingResultRow>(
      supabase
        .from('funding_results')
        .select('id,funding_application_id,result_status,approved_amount_cents,result_notes,outcome_at,metadata,created_at')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .order('created_at', { ascending: false })
        .limit(50)
    ),
    resolveMany<FundingOutcomeRow>(
      supabase
        .from('funding_outcomes')
        .select('id,outcome_status,approved_amount_cents,approval_date,provider_name,product_type,created_at')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .order('created_at', { ascending: false })
        .limit(50)
    ),
  ]);

  const approvedFromResults = results.filter((row) => String(row.result_status || '') === 'approved').length;
  const approvedFromLegacy = legacyOutcomes.filter((row) => String(row.outcome_status || '') === 'approved').length;
  const pendingApps = applications.filter((row) => {
    const status = String(row.decision_status || '');
    return status === 'submitted' || status === 'pending';
  }).length;

  const stage = inferFundingStage({
    approvedCount: approvedFromResults + approvedFromLegacy,
    pendingCount: pendingApps,
    readinessReady: false,
    businessReady: business.readiness.ready,
    hasCreditAnalysis: Boolean(credit.latest_analysis),
    explicitStage: profile?.current_stage || null,
  });

  const readiness = deriveFundingReadiness({
    credit,
    business,
    stage,
  });

  const recommendation = nextRecommendationFromState({
    readiness,
    currentStage: stage,
    applications,
    results,
    strategySteps,
  });

  await supabase
    .from('funding_profiles')
    .upsert(
      {
        tenant_id: params.tenantId,
        user_id: params.userId,
        current_stage: stage,
        readiness_status: readiness.ready ? 'ready' : 'blocked',
        profile_status: 'active',
        last_recommendation: recommendation,
      } as any,
      { onConflict: 'tenant_id,user_id' }
    );

  if (params.reconcileTasks) {
    await reconcileFundingTasks(supabase, {
      tenantId: params.tenantId,
      userId: params.userId,
      stage,
      readiness,
      recommendation,
      credit,
      business,
      applications,
      results,
    });
  }

  return {
    stage,
    readiness,
    recommendation,
    funding_profile: profile,
    strategy_steps: strategySteps,
    applications,
    results,
    legacy_outcomes: legacyOutcomes,
    credit,
    business,
  };
}

export async function getFundingHistory(
  supabase: SupabaseClient,
  params: { tenantId: string; userId: string }
) {
  const [applications, results, legacyOutcomes] = await Promise.all([
    resolveMany<FundingApplicationRow>(
      supabase
        .from('funding_applications')
        .select('id,provider_name,product_name,bureau_used,submitted_at,decision_status,approved_amount_cents,inquiry_detected,notes,created_at')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .order('created_at', { ascending: false })
        .limit(100)
    ),
    resolveMany<FundingResultRow>(
      supabase
        .from('funding_results')
        .select('id,funding_application_id,result_status,approved_amount_cents,result_notes,outcome_at,created_at')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .order('created_at', { ascending: false })
        .limit(100)
    ),
    resolveMany<FundingOutcomeRow>(
      supabase
        .from('funding_outcomes')
        .select('id,outcome_status,approved_amount_cents,approval_date,provider_name,product_type,created_at')
        .eq('tenant_id', params.tenantId)
        .eq('user_id', params.userId)
        .order('created_at', { ascending: false })
        .limit(100)
    ),
  ]);

  return {
    applications,
    results,
    legacy_outcomes: legacyOutcomes,
  };
}

export async function logFundingApplyEvent(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    providerName?: string | null;
    productName?: string | null;
    bureauUsed?: string | null;
    submittedAt?: string | null;
    decisionStatus?: FundingDecisionStatus | string | null;
    approvedAmount?: number | null;
    notes?: string | null;
    inquiryDetected?: boolean | null;
    relatedStrategyStepId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const decisionStatus = normalizeDecisionStatus(params.decisionStatus || 'submitted');
  const submittedAt = params.submittedAt || new Date().toISOString();

  const applicationPayload = {
    tenant_id: params.tenantId,
    user_id: params.userId,
    strategy_step_id: params.relatedStrategyStepId || null,
    provider_name: params.providerName || null,
    product_name: params.productName || null,
    bureau_used: params.bureauUsed || null,
    submitted_at: submittedAt,
    decision_status: decisionStatus,
    approved_amount_cents: dollarsToCents(params.approvedAmount),
    inquiry_detected: params.inquiryDetected ?? null,
    notes: params.notes || null,
    metadata: safeObject(params.metadata),
  };

  const appInsert = await supabase
    .from('funding_applications')
    .insert(applicationPayload as any)
    .select('id')
    .single();

  if (appInsert.error) {
    throw new Error(appInsert.error.message || 'Unable to log funding application');
  }

  const applicationId = String(appInsert.data?.id || '');

  const resultPayload = {
    tenant_id: params.tenantId,
    user_id: params.userId,
    funding_application_id: applicationId || null,
    result_status: decisionStatus,
    approved_amount_cents: dollarsToCents(params.approvedAmount),
    result_notes: params.notes || null,
    outcome_at: new Date().toISOString(),
    metadata: {
      bureau_used: params.bureauUsed || null,
      provider_name: params.providerName || null,
      product_name: params.productName || null,
      inquiry_detected: params.inquiryDetected ?? null,
      submitted_at: submittedAt,
      related_strategy_step_id: params.relatedStrategyStepId || null,
    },
  };

  const resultInsert = await supabase.from('funding_results').insert(resultPayload as any);
  if (resultInsert.error) {
    throw new Error(resultInsert.error.message || 'Unable to log funding result');
  }

  let stage = 'application_loop';
  if (decisionStatus === 'approved') stage = 'post_funding_capital';
  if (decisionStatus === 'denied') stage = 'funding_roadmap';

  await supabase
    .from('funding_profiles')
    .upsert(
      {
        tenant_id: params.tenantId,
        user_id: params.userId,
        current_stage: stage,
        readiness_status: decisionStatus === 'approved' ? 'ready' : 'not_ready',
        profile_status: 'active',
        metadata: {
          last_logged_decision_status: decisionStatus,
          last_logged_at: new Date().toISOString(),
        },
      } as any,
      { onConflict: 'tenant_id,user_id' }
    );

  const roadmap = await getFundingRoadmapData(supabase, {
    tenantId: params.tenantId,
    userId: params.userId,
    reconcileTasks: true,
  });

  return {
    application_id: applicationId,
    decision_status: decisionStatus,
    stage: roadmap.stage,
    recommendation: roadmap.recommendation,
    readiness: roadmap.readiness,
  };
}

export async function reconcileFundingTasks(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    stage: string;
    readiness: FundingReadiness;
    recommendation: FundingRecommendation;
    credit: Awaited<ReturnType<typeof getCreditDomainData>>;
    business: Awaited<ReturnType<typeof getBusinessFoundationData>>;
    applications: FundingApplicationRow[];
    results: FundingResultRow[];
  }
) {
  const rows: any[] = [];

  rows.push({
    tenant_id: params.tenantId,
    task_id: 'nexus_funding_stage_summary',
    title: 'Review Current Funding Stage',
    description: `Current stage: ${params.stage.replace(/_/g, ' ')}.`,
    status: 'completed',
    signal: 'green',
    due_date: isoDatePlusDays(0),
    type: 'review',
    assigned_employee: 'Funding Guide',
    group_key: 'funding_journey',
    template_key: 'funding_stage',
    task_category: 'funding_stage',
    priority: 'low',
    link: '#portal',
    linked_to_goal: true,
    meta: { category: 'funding_stage', stage: params.stage },
  });

  const hasReport = Boolean(params.credit.latest_report);
  const hasAnalysis = Boolean(params.credit.latest_analysis);

  rows.push({
    tenant_id: params.tenantId,
    task_id: 'nexus_credit_upload',
    title: 'Upload Credit Report',
    description: 'Upload your latest credit report to unlock recommendations.',
    status: hasReport ? 'completed' : 'pending',
    signal: hasReport ? 'green' : 'red',
    due_date: isoDatePlusDays(1),
    type: 'upload',
    assigned_employee: 'Credit Advisor',
    group_key: 'funding_journey',
    template_key: 'credit_upload',
    task_category: 'credit_upload',
    priority: hasReport ? 'low' : 'urgent',
    link: '#portal',
    linked_to_goal: true,
    meta: { category: 'credit_upload' },
  });

  rows.push({
    tenant_id: params.tenantId,
    task_id: 'nexus_credit_review',
    title: 'Review Credit Analysis',
    description: 'Review analysis and dispute recommendations before applying.',
    status: hasAnalysis ? 'completed' : 'pending',
    signal: hasAnalysis ? 'green' : hasReport ? 'yellow' : 'red',
    due_date: isoDatePlusDays(2),
    type: 'review',
    assigned_employee: 'Credit Advisor',
    group_key: 'funding_journey',
    template_key: 'credit_review',
    task_category: 'credit_review',
    priority: hasAnalysis ? 'low' : hasReport ? 'recommended' : 'urgent',
    link: '#portal',
    linked_to_goal: true,
    meta: { category: 'credit_review' },
  });

  rows.push({
    tenant_id: params.tenantId,
    task_id: 'nexus_business_path',
    title: 'Select Business Foundation Path',
    description: 'Choose New Business or Existing Business Optimization.',
    status: params.business.readiness.path ? 'completed' : 'pending',
    signal: params.business.readiness.path ? 'green' : 'red',
    due_date: isoDatePlusDays(1),
    type: 'action',
    assigned_employee: 'Business Setup Advisor',
    group_key: 'funding_journey',
    template_key: 'business_path',
    task_category: 'business_setup_step',
    priority: params.business.readiness.path ? 'low' : 'urgent',
    link: '#portal',
    linked_to_goal: true,
    meta: { category: 'business_path' },
  });

  rows.push({
    tenant_id: params.tenantId,
    task_id: 'nexus_business_readiness',
    title: 'Complete Business Foundation Steps',
    description:
      params.business.readiness.missing_steps.length > 0
        ? `Missing steps: ${params.business.readiness.missing_steps.join(', ')}`
        : 'Business Foundation steps are complete.',
    status: params.business.readiness.ready ? 'completed' : 'pending',
    signal: params.business.readiness.ready ? 'green' : 'red',
    due_date: isoDatePlusDays(3),
    type: 'action',
    assigned_employee: 'Business Setup Advisor',
    group_key: 'funding_journey',
    template_key: 'business_readiness',
    task_category: 'business_setup_step',
    priority: params.business.readiness.ready ? 'low' : 'urgent',
    link: '#portal',
    linked_to_goal: true,
    meta: { category: 'business_readiness', missing: params.business.readiness.missing_steps },
  });

  const hasPendingApplication = params.applications.some((row) => {
    const status = String(row.decision_status || '');
    return status === 'submitted' || status === 'pending';
  });

  rows.push({
    tenant_id: params.tenantId,
    task_id: 'nexus_funding_application',
    title: 'Submit Next Funding Application',
    description: 'Use roadmap recommendation to submit the next application.',
    status: params.readiness.ready && !hasPendingApplication ? 'pending' : 'completed',
    signal: params.readiness.ready && !hasPendingApplication ? 'yellow' : 'green',
    due_date: isoDatePlusDays(2),
    type: 'action',
    assigned_employee: 'Funding Guide',
    group_key: 'funding_journey',
    template_key: 'funding_application',
    task_category: 'funding_application',
    priority: params.readiness.ready && !hasPendingApplication ? 'recommended' : 'low',
    link: '#portal',
    linked_to_goal: true,
    meta: { category: 'funding_application' },
  });

  rows.push({
    tenant_id: params.tenantId,
    task_id: 'nexus_funding_result_log',
    title: 'Log Funding Application Outcome',
    description: 'Log submitted/approved/denied/pending/cancelled outcome to continue sequencing.',
    status: hasPendingApplication ? 'pending' : 'completed',
    signal: hasPendingApplication ? 'red' : 'green',
    due_date: isoDatePlusDays(1),
    type: 'review',
    assigned_employee: 'Funding Guide',
    group_key: 'funding_journey',
    template_key: 'funding_result_log',
    task_category: 'funding_result_log',
    priority: hasPendingApplication ? 'urgent' : 'low',
    link: '#portal',
    linked_to_goal: true,
    meta: { category: 'funding_result_log' },
  });

  if (params.stage === 'post_funding_capital') {
    rows.push({
      tenant_id: params.tenantId,
      task_id: 'nexus_capital_setup',
      title: 'Complete Capital Protection Setup',
      description: 'Set reserve target and complete capital setup before optional paths.',
      status: 'pending',
      signal: 'yellow',
      due_date: isoDatePlusDays(3),
      type: 'action',
      assigned_employee: 'Funding Guide',
      group_key: 'capital',
      template_key: 'capital_setup',
      task_category: 'capital_setup',
      priority: 'recommended',
      link: '#portal',
      linked_to_goal: true,
      meta: { category: 'capital_setup' },
    });
  }

  const upsertRows = rows.map((row) => ({
    ...row,
    status: row.status as PortalTaskStatus,
    due_date: String(row.due_date || isoDatePlusDays(3)),
  }));

  const upsertRes = await supabase
    .from('client_tasks')
    .upsert(upsertRows as any, { onConflict: 'tenant_id,task_id' });

  if (upsertRes.error && !shouldIgnoreRelationError(upsertRes.error)) {
    throw new Error(upsertRes.error.message || 'Failed to reconcile client tasks');
  }
}

export async function getPortalTasks(
  supabase: SupabaseClient,
  params: { tenantId: string; userId: string; reconcile?: boolean }
): Promise<PortalTaskBoard> {
  await getFundingRoadmapData(supabase, {
    tenantId: params.tenantId,
    userId: params.userId,
    reconcileTasks: params.reconcile,
  });

  const tasks = await resolveMany<any>(
    supabase
      .from('client_tasks')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .or('group_key.eq.funding_journey,group_key.eq.capital')
      .order('due_date', { ascending: true })
      .limit(200)
  );

  const visible = tasks.filter((task) => !task.dismissed_at);
  const completed = visible.filter((task) => task.status === 'completed');
  const pending = visible.filter((task) => task.status !== 'completed');
  const urgent = pending.filter((task) => task.signal === 'red' || task.priority === 'urgent');
  const recommended = pending.filter((task) => !urgent.includes(task));

  return {
    top_task: urgent[0] || recommended[0] || null,
    urgent,
    recommended,
    completed,
  };
}

export async function buildPortalAIContext(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    role: 'funding_guide' | 'credit_advisor' | 'business_setup_advisor';
    coachingGoal: string;
  }
) {
  const [roadmap, tasks, latestHistory] = await Promise.all([
    getFundingRoadmapData(supabase, {
      tenantId: params.tenantId,
      userId: params.userId,
      reconcileTasks: false,
    }),
    getPortalTasks(supabase, {
      tenantId: params.tenantId,
      userId: params.userId,
      reconcile: false,
    }),
    getFundingHistory(supabase, {
      tenantId: params.tenantId,
      userId: params.userId,
    }),
  ]);

  return {
    role: params.role,
    coaching_goal: params.coachingGoal,
    user_stage: roadmap.stage,
    top_task: tasks.top_task,
    blockers: roadmap.readiness.blockers,
    roadmap_summary: {
      stage: roadmap.stage,
      ready: roadmap.readiness.ready,
      recommendation: roadmap.recommendation,
    },
    recent_history: {
      applications: latestHistory.applications.slice(0, 5),
      results: latestHistory.results.slice(0, 5),
    },
    credit_summary: {
      latest_report: roadmap.credit.latest_report,
      latest_analysis: roadmap.credit.latest_analysis,
      recommendation_count: roadmap.credit.recommendations.length,
      letters_count: roadmap.credit.letters.length,
    },
    business_summary: {
      path: roadmap.business.readiness.path,
      ready: roadmap.business.readiness.ready,
      missing_steps: roadmap.business.readiness.missing_steps,
    },
    task_board: {
      urgent_count: tasks.urgent.length,
      recommended_count: tasks.recommended.length,
      completed_count: tasks.completed.length,
    },
  };
}
