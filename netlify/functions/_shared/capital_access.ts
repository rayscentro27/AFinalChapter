import type { SupabaseClient } from '@supabase/supabase-js';

export type CapitalPath = 'business_growth' | 'trading_education' | 'grant_funding';
export type CapitalSetupStatus = 'not_started' | 'in_progress' | 'ready' | 'completed';
export type CapitalStepStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';

export type CapitalStepItem = {
  step_key: string;
  status: CapitalStepStatus;
  notes: string | null;
  is_required: boolean;
};

export type CapitalReadinessPayload = {
  ready: boolean;
  blockers: string[];
  recommended_next_steps: string[];
  reserve_guidance: {
    total_funding_received: number | null;
    estimated_monthly_payment: number | null;
    reserve_target_months: number;
    recommended_reserve_amount: number | null;
    reserve_confirmed: boolean;
    reserve_confirmed_at: string | null;
    reserve_gap_amount: number | null;
  };
  context: {
    post_funding_eligible: boolean;
    funding_stage: string | null;
    capital_profile_id: string | null;
    capital_setup_status: CapitalSetupStatus;
    missing_setup_steps: string[];
    completed_setup_steps: string[];
    selected_path: CapitalPath | null;
  };
};

export type CapitalEligibility = {
  eligible: boolean;
  funding_stage: string | null;
  latest_approved_application_id: string | null;
  approved_total_amount: number | null;
};

export type CapitalAllocationState = {
  selected_path: CapitalPath | null;
  selected_at: string | null;
  current_state: string | null;
  latest_choice: Record<string, unknown> | null;
  history: Record<string, unknown>[];
  options: Array<{
    path: CapitalPath;
    available: boolean;
    gated: boolean;
    reason: string | null;
  }>;
};

export type CapitalProfileResponse = {
  id: string | null;
  total_funding_received: number | null;
  estimated_monthly_payment: number | null;
  recommended_reserve_amount: number | null;
  reserve_target_months: number;
  reserve_confirmed: boolean;
  reserve_confirmed_at: string | null;
  business_growth_positioned: boolean;
  capital_setup_status: CapitalSetupStatus;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

export type CapitalDataPayload = {
  readiness: CapitalReadinessPayload;
  profile: CapitalProfileResponse | null;
  setup_progress: CapitalStepItem[];
  allocation: CapitalAllocationState;
  eligibility: CapitalEligibility;
};

type FundingOutcomeRow = {
  id: string;
  outcome_status: string | null;
  approved_amount_cents: number | string | null;
  created_at: string | null;
};

type CapitalProfileRow = {
  id: string;
  total_funding_received_cents: number | string | null;
  estimated_monthly_payment_cents: number | string | null;
  recommended_reserve_amount_cents: number | string | null;
  reserve_months_target: number | null;
  reserve_confirmed: boolean | null;
  reserve_confirmed_at: string | null;
  business_growth_positioned: boolean | null;
  capital_setup_status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

type CapitalAllocationRow = {
  id: string;
  selected_path: CapitalPath | null;
  selected_at: string | null;
  current_state: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

const DEFAULT_STEPS: string[] = [
  'understand_capital',
  'set_payment_reserve',
  'position_business_funds',
];

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function centsToDollars(value: unknown): number | null {
  const cents = toNumber(value);
  if (cents === null) return null;
  return Math.round(cents) / 100;
}

function dollarsToCents(value: unknown): number | null {
  const dollars = toNumber(value);
  if (dollars === null) return null;
  return Math.round(dollars * 100);
}

function statusCodeOf(error: unknown): number {
  const status = Number((error as any)?.statusCode);
  if (Number.isFinite(status) && status >= 100) return status;
  return 400;
}

function ensureError(message: string, statusCode: number): never {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

function normalizeSetupStatus(value: string | null | undefined): CapitalSetupStatus {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'in_progress') return 'in_progress';
  if (normalized === 'ready') return 'ready';
  if (normalized === 'completed') return 'completed';
  if (normalized === 'blocked') return 'in_progress';
  return 'not_started';
}

function normalizeStepStatus(value: string | null | undefined): CapitalStepStatus {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'in_progress') return 'in_progress';
  if (normalized === 'completed') return 'completed';
  if (normalized === 'blocked') return 'blocked';
  return 'not_started';
}

function isoDatePlusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function safeObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseSetupProgress(metadata: Record<string, unknown> | null | undefined): CapitalStepItem[] {
  const bag = safeObject(metadata);
  const setupSteps = safeObject(bag.setup_steps);

  const known = new Set<string>(DEFAULT_STEPS);
  Object.keys(setupSteps).forEach((key) => known.add(key));

  return Array.from(known).map((stepKey) => {
    const row = safeObject(setupSteps[stepKey]);
    return {
      step_key: stepKey,
      status: normalizeStepStatus(String(row.status || 'not_started')),
      notes: typeof row.notes === 'string' && row.notes.trim().length > 0 ? row.notes.trim() : null,
      is_required: row.is_required === false ? false : true,
    };
  });
}

function mergeSetupProgressMetadata(
  metadata: Record<string, unknown> | null | undefined,
  rows: CapitalStepItem[]
): Record<string, unknown> {
  const base = safeObject(metadata);
  const setupSteps: Record<string, unknown> = {};

  for (const row of rows) {
    setupSteps[row.step_key] = {
      status: row.status,
      notes: row.notes,
      is_required: row.is_required,
    };
  }

  return {
    ...base,
    setup_steps: setupSteps,
  };
}

function summarizeSetupStatus(rows: CapitalStepItem[], reserveConfirmed: boolean): CapitalSetupStatus {
  const required = rows.filter((row) => row.is_required !== false);
  const completedRequired = required.filter((row) => row.status === 'completed').length;

  if (required.length > 0 && completedRequired === required.length && reserveConfirmed) {
    return 'completed';
  }

  if (completedRequired > 0 || reserveConfirmed) {
    return 'in_progress';
  }

  return 'not_started';
}

async function readFundingOutcomes(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<FundingOutcomeRow[]> {
  const { data, error } = await supabase
    .from('funding_outcomes')
    .select('id,outcome_status,approved_amount_cents,created_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return [];
  }

  return (data || []) as FundingOutcomeRow[];
}

async function readCapitalProfile(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<CapitalProfileRow | null> {
  const { data, error } = await supabase
    .from('capital_profiles')
    .select(
      'id,total_funding_received_cents,estimated_monthly_payment_cents,recommended_reserve_amount_cents,reserve_months_target,reserve_confirmed,reserve_confirmed_at,business_growth_positioned,capital_setup_status,metadata,created_at,updated_at'
    )
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return (data || null) as CapitalProfileRow | null;
}

async function readCapitalAllocation(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<CapitalAllocationRow | null> {
  const { data, error } = await supabase
    .from('capital_allocation_choices')
    .select('id,selected_path,selected_at,current_state,metadata,created_at,updated_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return (data || null) as CapitalAllocationRow | null;
}

function toProfileResponse(row: CapitalProfileRow | null): CapitalProfileResponse | null {
  if (!row) return null;

  return {
    id: row.id,
    total_funding_received: centsToDollars(row.total_funding_received_cents),
    estimated_monthly_payment: centsToDollars(row.estimated_monthly_payment_cents),
    recommended_reserve_amount: centsToDollars(row.recommended_reserve_amount_cents),
    reserve_target_months: Number(row.reserve_months_target || 6),
    reserve_confirmed: Boolean(row.reserve_confirmed),
    reserve_confirmed_at: row.reserve_confirmed_at || null,
    business_growth_positioned: Boolean(row.business_growth_positioned),
    capital_setup_status: normalizeSetupStatus(row.capital_setup_status),
    metadata: safeObject(row.metadata),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function normalizeAllocationState(params: {
  row: CapitalAllocationRow | null;
  readinessReady: boolean;
}): CapitalAllocationState {
  const selectedPath = params.row?.selected_path || null;

  return {
    selected_path: selectedPath,
    selected_at: params.row?.selected_at || null,
    current_state: params.row?.current_state || null,
    latest_choice: params.row
      ? {
          id: params.row.id,
          selected_path: params.row.selected_path,
          selected_at: params.row.selected_at,
          current_state: params.row.current_state,
          metadata: safeObject(params.row.metadata),
        }
      : null,
    history: params.row
      ? [
          {
            id: params.row.id,
            selected_path: params.row.selected_path,
            selected_at: params.row.selected_at,
            current_state: params.row.current_state,
          },
        ]
      : [],
    options: [
      {
        path: 'business_growth',
        available: params.readinessReady,
        gated: !params.readinessReady,
        reason: params.readinessReady
          ? null
          : 'Complete capital protection first (reserve confirmation + setup checklist).',
      },
      {
        path: 'trading_education',
        available: false,
        gated: true,
        reason: 'Locked in this phase. Business Growth remains the primary path.',
      },
      {
        path: 'grant_funding',
        available: false,
        gated: true,
        reason: 'Locked in this phase. Business Growth remains the primary path.',
      },
    ],
  };
}

async function reconcileCapitalTasks(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    eligible: boolean;
    reserveConfirmed: boolean;
    setupComplete: boolean;
    readinessReady: boolean;
    selectedPath: CapitalPath | null;
  }
): Promise<void> {
  if (!params.eligible) return;

  const rows = [
    {
      tenant_id: params.tenantId,
      user_id: params.userId,
      task_id: 'capital_review_funding_summary',
      title: 'Review funding summary',
      description: 'Confirm your approved capital totals before configuring reserve strategy.',
      status: 'pending',
      signal: 'yellow',
      due_date: isoDatePlusDays(1),
      type: 'review',
      group_key: 'capital',
      assigned_employee: 'Funding Guide',
      linked_to_goal: true,
      link: '#portal',
      meta: { category: 'capital_protection', priority: 'medium' },
    },
    {
      tenant_id: params.tenantId,
      user_id: params.userId,
      task_id: 'capital_confirm_reserve_target',
      title: 'Confirm reserve target',
      description: 'Set and confirm reserve before opening allocation options.',
      status: params.reserveConfirmed ? 'completed' : 'pending',
      signal: params.reserveConfirmed ? 'green' : 'red',
      due_date: isoDatePlusDays(2),
      type: 'action',
      group_key: 'capital',
      assigned_employee: 'Funding Guide',
      linked_to_goal: true,
      link: '#portal',
      meta: { category: 'capital_protection', priority: 'high' },
    },
    {
      tenant_id: params.tenantId,
      user_id: params.userId,
      task_id: 'capital_complete_setup',
      title: 'Complete capital setup checklist',
      description: 'Finish reserve-first setup steps before choosing your post-funding path.',
      status: params.setupComplete ? 'completed' : 'pending',
      signal: params.setupComplete ? 'green' : 'yellow',
      due_date: isoDatePlusDays(3),
      type: 'action',
      group_key: 'capital',
      assigned_employee: 'Funding Guide',
      linked_to_goal: true,
      link: '#portal',
      meta: { category: 'capital_protection', priority: 'medium' },
    },
    {
      tenant_id: params.tenantId,
      user_id: params.userId,
      task_id: 'capital_choose_business_growth_path',
      title: 'Choose Business Growth path',
      description: 'Business Growth is the primary post-funding allocation path.',
      status:
        params.readinessReady && params.selectedPath !== 'business_growth'
          ? 'pending'
          : 'completed',
      signal:
        params.readinessReady && params.selectedPath !== 'business_growth'
          ? 'yellow'
          : 'green',
      due_date: isoDatePlusDays(5),
      type: 'action',
      group_key: 'capital',
      assigned_employee: 'Funding Guide',
      linked_to_goal: true,
      link: '#portal',
      meta: { category: 'capital_allocation', priority: 'medium' },
    },
  ];

  await supabase.from('client_tasks').upsert(rows as any, { onConflict: 'tenant_id,task_id' });
}

export async function resolveAuthedUserId(supabase: SupabaseClient): Promise<string> {
  const authRes = await supabase.auth.getUser();
  const userId = String(authRes.data.user?.id || '').trim();
  if (!userId) {
    ensureError('Unauthorized', 401);
  }
  return userId;
}

export async function buildCapitalDataPayload(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    reconcileTasks?: boolean;
  }
): Promise<CapitalDataPayload> {
  const [fundingOutcomes, profileRow, allocationRow] = await Promise.all([
    readFundingOutcomes(supabase, params.tenantId, params.userId),
    readCapitalProfile(supabase, params.tenantId, params.userId),
    readCapitalAllocation(supabase, params.tenantId, params.userId),
  ]);

  const approvedRows = fundingOutcomes.filter(
    (row) => String(row.outcome_status || '').toLowerCase() === 'approved'
  );
  const approvedTotalCents = approvedRows.reduce((sum, row) => {
    const amount = toNumber(row.approved_amount_cents);
    return sum + (amount && amount > 0 ? amount : 0);
  }, 0);

  const postFundingEligible = approvedRows.length > 0;
  const reserveConfirmed = Boolean(profileRow?.reserve_confirmed);

  const setupProgress = parseSetupProgress(profileRow?.metadata);
  const completedSetupSteps = setupProgress
    .filter((row) => row.status === 'completed')
    .map((row) => row.step_key);
  const missingSetupSteps = setupProgress
    .filter((row) => row.is_required !== false && row.status !== 'completed')
    .map((row) => row.step_key);
  const setupComplete = missingSetupSteps.length === 0;

  const profileFundingTotalCents = toNumber(profileRow?.total_funding_received_cents);
  const totalFundingCents =
    profileFundingTotalCents !== null && profileFundingTotalCents > 0
      ? profileFundingTotalCents
      : approvedTotalCents > 0
      ? approvedTotalCents
      : null;

  const reserveTargetMonths = Math.max(1, Math.min(18, Number(profileRow?.reserve_months_target || 6)));
  const estimatedPaymentCents = toNumber(profileRow?.estimated_monthly_payment_cents);
  const profileRecommendedReserveCents = toNumber(profileRow?.recommended_reserve_amount_cents);
  const recommendedReserveCents =
    profileRecommendedReserveCents !== null
      ? profileRecommendedReserveCents
      : estimatedPaymentCents !== null
      ? estimatedPaymentCents * reserveTargetMonths
      : null;

  const reserveGapCents =
    reserveConfirmed || recommendedReserveCents === null
      ? 0
      : recommendedReserveCents;

  const normalizedSetupStatus = normalizeSetupStatus(profileRow?.capital_setup_status);
  const capitalSetupStatus =
    normalizedSetupStatus === 'completed' || normalizedSetupStatus === 'ready'
      ? normalizedSetupStatus
      : summarizeSetupStatus(setupProgress, reserveConfirmed);

  const selectedPath = allocationRow?.selected_path || null;
  const businessGrowthPositioned =
    Boolean(profileRow?.business_growth_positioned) || selectedPath === 'business_growth';

  const blockers: string[] = [];
  if (!postFundingEligible) {
    blockers.push('Funding approval is required before capital protection starts.');
  }
  if (!reserveConfirmed) {
    blockers.push('Confirm your reserve target to unlock allocation.');
  }
  if (!setupComplete) {
    blockers.push('Complete remaining capital setup checklist steps.');
  }

  const recommendedNextSteps: string[] = [];
  if (!postFundingEligible) {
    recommendedNextSteps.push('Complete funding roadmap milestones and log approved outcomes.');
  }
  if (!reserveConfirmed) {
    recommendedNextSteps.push('Set and confirm reserve target (6-9 months recommended).');
  }
  if (!setupComplete) {
    recommendedNextSteps.push('Finish reserve-first setup checklist items.');
  }
  if (postFundingEligible && reserveConfirmed && setupComplete && selectedPath !== 'business_growth') {
    recommendedNextSteps.push('Activate Business Growth path as your primary post-funding allocation.');
  }

  const readinessReady = postFundingEligible && reserveConfirmed && setupComplete;

  const readiness: CapitalReadinessPayload = {
    ready: readinessReady,
    blockers,
    recommended_next_steps: recommendedNextSteps,
    reserve_guidance: {
      total_funding_received: centsToDollars(totalFundingCents),
      estimated_monthly_payment: centsToDollars(estimatedPaymentCents),
      reserve_target_months: reserveTargetMonths,
      recommended_reserve_amount: centsToDollars(recommendedReserveCents),
      reserve_confirmed: reserveConfirmed,
      reserve_confirmed_at: profileRow?.reserve_confirmed_at || null,
      reserve_gap_amount: centsToDollars(reserveGapCents),
    },
    context: {
      post_funding_eligible: postFundingEligible,
      funding_stage: postFundingEligible ? 'post_funding' : 'pre_funding',
      capital_profile_id: profileRow?.id || null,
      capital_setup_status: capitalSetupStatus,
      missing_setup_steps: missingSetupSteps,
      completed_setup_steps: completedSetupSteps,
      selected_path: selectedPath,
    },
  };

  const allocation = normalizeAllocationState({ row: allocationRow, readinessReady });

  const eligibility: CapitalEligibility = {
    eligible: postFundingEligible,
    funding_stage: postFundingEligible ? 'post_funding' : 'pre_funding',
    latest_approved_application_id: approvedRows[0]?.id || null,
    approved_total_amount: centsToDollars(approvedTotalCents),
  };

  if (params.reconcileTasks) {
    await reconcileCapitalTasks(supabase, {
      tenantId: params.tenantId,
      userId: params.userId,
      eligible: postFundingEligible,
      reserveConfirmed,
      setupComplete,
      readinessReady,
      selectedPath,
    });
  }

  return {
    readiness,
    profile: toProfileResponse(profileRow),
    setup_progress: setupProgress,
    allocation,
    eligibility,
  };
}

export async function upsertCapitalProfile(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    totalFundingReceived?: number | null;
    estimatedMonthlyPayment?: number | null;
    reserveTargetMonths?: number | null;
    recommendedReserveAmount?: number | null;
    reserveConfirmed?: boolean;
    reserveConfirmedAt?: string | null;
    businessGrowthPositioned?: boolean;
    capitalSetupStatus?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    tenant_id: params.tenantId,
    user_id: params.userId,
  };

  if (params.totalFundingReceived !== undefined) {
    payload.total_funding_received_cents = dollarsToCents(params.totalFundingReceived);
  }
  if (params.estimatedMonthlyPayment !== undefined) {
    payload.estimated_monthly_payment_cents = dollarsToCents(params.estimatedMonthlyPayment);
  }
  if (params.reserveTargetMonths !== undefined && params.reserveTargetMonths !== null) {
    payload.reserve_months_target = Math.max(1, Math.min(18, Math.round(params.reserveTargetMonths)));
  }
  if (params.recommendedReserveAmount !== undefined) {
    payload.recommended_reserve_amount_cents = dollarsToCents(params.recommendedReserveAmount);
  }
  if (params.reserveConfirmed !== undefined) {
    payload.reserve_confirmed = params.reserveConfirmed;
    payload.reserve_confirmed_at = params.reserveConfirmed
      ? params.reserveConfirmedAt || new Date().toISOString()
      : null;
  }
  if (params.businessGrowthPositioned !== undefined) {
    payload.business_growth_positioned = params.businessGrowthPositioned;
  }
  if (params.capitalSetupStatus !== undefined && params.capitalSetupStatus !== null) {
    payload.capital_setup_status = normalizeSetupStatus(params.capitalSetupStatus);
  }
  if (params.metadata !== undefined) {
    payload.metadata = safeObject(params.metadata);
  }

  const { error } = await supabase
    .from('capital_profiles')
    .upsert(payload as any, { onConflict: 'tenant_id,user_id' });

  if (error) {
    throw new Error(error.message || 'Unable to save capital profile.');
  }
}

export async function upsertCapitalSetupProgress(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    stepKey: string;
    stepStatus: CapitalStepStatus;
    notes?: string | null;
    isRequired?: boolean;
  }
): Promise<CapitalStepItem> {
  const existing = await readCapitalProfile(supabase, params.tenantId, params.userId);
  const setupRows = parseSetupProgress(existing?.metadata);

  const index = setupRows.findIndex((row) => row.step_key === params.stepKey);
  const next: CapitalStepItem = {
    step_key: params.stepKey,
    status: normalizeStepStatus(params.stepStatus),
    notes: params.notes ? String(params.notes).trim() : null,
    is_required: params.isRequired === false ? false : true,
  };

  if (index >= 0) {
    setupRows[index] = next;
  } else {
    setupRows.push(next);
  }

  const reserveConfirmed = Boolean(existing?.reserve_confirmed);
  const capitalSetupStatus = summarizeSetupStatus(setupRows, reserveConfirmed);
  const metadata = mergeSetupProgressMetadata(existing?.metadata, setupRows);

  await upsertCapitalProfile(supabase, {
    tenantId: params.tenantId,
    userId: params.userId,
    capitalSetupStatus,
    metadata,
  });

  return next;
}

export async function setCapitalAllocationPath(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    selectedPath: CapitalPath;
    metadata?: Record<string, unknown>;
  }
): Promise<{ gating_note: string | null }> {
  const snapshot = await buildCapitalDataPayload(supabase, {
    tenantId: params.tenantId,
    userId: params.userId,
    reconcileTasks: false,
  });

  if (params.selectedPath !== 'business_growth') {
    ensureError('Trading and grant paths remain locked in this phase. Business Growth stays primary.', 400);
  }

  if (!snapshot.readiness.ready) {
    ensureError('Complete Capital Protection before selecting an allocation path.', 400);
  }

  const payload = {
    tenant_id: params.tenantId,
    user_id: params.userId,
    selected_path: params.selectedPath,
    selected_at: new Date().toISOString(),
    current_state: 'active',
    metadata: safeObject(params.metadata),
  };

  const { error } = await supabase
    .from('capital_allocation_choices')
    .upsert(payload as any, { onConflict: 'tenant_id,user_id' });

  if (error) {
    throw new Error(error.message || 'Unable to save capital allocation path.');
  }

  await upsertCapitalProfile(supabase, {
    tenantId: params.tenantId,
    userId: params.userId,
    businessGrowthPositioned: true,
  });

  return {
    gating_note: null,
  };
}

export function toHttpErrorBody(error: unknown) {
  return {
    statusCode: statusCodeOf(error),
    body: {
      error: String((error as any)?.message || 'Bad Request'),
    },
  };
}
