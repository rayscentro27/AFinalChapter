import type { SupabaseClient } from '@supabase/supabase-js';

const ADVANCED_TRADING_FEATURE = 'advanced_trading';
const DEFAULT_DISCLAIMER_VERSION = 'trading-v1';

export type TradingAccessSnapshot = {
  tenant_id: string;
  user_id: string;
  feature_key: string;
  eligible: boolean;
  blockers: string[];
  unlocked: boolean;
  opted_in: boolean;
  video_complete: boolean;
  disclaimer_complete: boolean;
  access_ready: boolean;
  access_status: 'locked' | 'eligible_pending' | 'in_progress' | 'ready' | 'unlocked';
  disclaimer_version: string;
  intro_video_url: string | null;
  intro_video_watched_at: string | null;
  disclaimer_accepted_at: string | null;
  selected_allocation_path: 'business_growth' | 'trading_education' | 'grant_funding' | null;
  paper_trading_recommended: boolean;
  reserve_confirmed: boolean;
  business_growth_positioned: boolean;
  trading_access_tier: 'super_admin' | 'internal_operator' | 'client_basic' | 'client_intermediate' | 'client_advanced';
  trading_stage: 'education_only' | 'paper_trading' | 'strategy_view' | 'demo_broker_enabled' | 'admin_lab_full';
  admin_lab_enabled: boolean;
  strategy_access_allowed: boolean;
  demo_connection_allowed: boolean;
  trading_level: number;
  updated_at: string | null;
};

type AccessRow = {
  tenant_id: string;
  user_id: string;
  feature_key: string;
  eligibility_status: 'unknown' | 'eligible' | 'ineligible';
  unlocked_by_rule: boolean;
  opted_in: boolean;
  opted_in_at: string | null;
  intro_video_url: string | null;
  intro_video_watched_at: string | null;
  disclaimer_version: string;
  disclaimer_accepted_at: string | null;
  paper_trading_acknowledged: boolean;
  access_status: 'locked' | 'eligible_pending' | 'in_progress' | 'ready' | 'unlocked';
  trading_access_tier: 'super_admin' | 'internal_operator' | 'client_basic' | 'client_intermediate' | 'client_advanced';
  trading_stage: 'education_only' | 'paper_trading' | 'strategy_view' | 'demo_broker_enabled' | 'admin_lab_full';
  admin_lab_enabled: boolean;
  strategy_access_allowed: boolean;
  demo_connection_allowed: boolean;
  trading_level: number;
  metadata: Record<string, unknown>;
  updated_at: string | null;
};

type CapitalProfileRow = {
  reserve_confirmed: boolean | null;
  reserve_confirmed_at: string | null;
  capital_setup_status: string | null;
  business_growth_positioned: boolean | null;
};

type AllocationChoiceRow = {
  selected_path: 'business_growth' | 'trading_education' | 'grant_funding' | null;
  current_state: string | null;
};

function normalizeErrorStatus(error: unknown): number {
  const status = Number((error as any)?.statusCode);
  if (Number.isFinite(status) && status >= 100) return status;
  return 400;
}

function defaultIntroVideoUrl(): string | null {
  const value = String(process.env.TRADING_OVERVIEW_VIDEO_URL || '').trim();
  return value || null;
}

function toIsoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

async function hasApprovedFunding(supabase: SupabaseClient, tenantId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('funding_outcomes')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('outcome_status', 'approved')
    .limit(1);

  if (error) {
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

async function readCapitalProfile(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<CapitalProfileRow | null> {
  const { data, error } = await supabase
    .from('capital_profiles')
    .select('reserve_confirmed,reserve_confirmed_at,capital_setup_status,business_growth_positioned')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return (data || null) as CapitalProfileRow | null;
}

async function readAllocationChoice(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<AllocationChoiceRow | null> {
  const { data, error } = await supabase
    .from('capital_allocation_choices')
    .select('selected_path,current_state')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return (data || null) as AllocationChoiceRow | null;
}

async function readAccessRow(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<AccessRow | null> {
  const { data, error } = await supabase
    .from('user_advanced_access')
    .select(
      'tenant_id,user_id,feature_key,eligibility_status,unlocked_by_rule,opted_in,opted_in_at,intro_video_url,intro_video_watched_at,disclaimer_version,disclaimer_accepted_at,paper_trading_acknowledged,access_status,trading_access_tier,trading_stage,admin_lab_enabled,strategy_access_allowed,demo_connection_allowed,trading_level,metadata,updated_at'
    )
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('feature_key', ADVANCED_TRADING_FEATURE)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return (data || null) as AccessRow | null;
}

function computeAccessStatus(params: {
  eligible: boolean;
  optedIn: boolean;
  videoComplete: boolean;
  disclaimerComplete: boolean;
  accessReady: boolean;
}): 'locked' | 'eligible_pending' | 'in_progress' | 'ready' | 'unlocked' {
  if (!params.eligible) return 'locked';
  if (params.accessReady) return 'unlocked';
  if (!params.optedIn) return 'eligible_pending';
  if (!params.videoComplete || !params.disclaimerComplete) return 'in_progress';
  return 'ready';
}

async function resolveTenantRoles(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<string[]> {
  const roles: string[] = [];

  const { data: memberships } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);

  (memberships || []).forEach((row: any) => {
    const role = String(row?.role || '').toLowerCase();
    if (role) roles.push(role);
  });

  if (roles.length > 0) return Array.from(new Set(roles));

  const { data: legacy } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);

  (legacy || []).forEach((row: any) => {
    const role = String(row?.role || '').toLowerCase();
    if (role) roles.push(role);
  });

  return Array.from(new Set(roles));
}

function computeTradingLevel(params: {
  eligible: boolean;
  optedIn: boolean;
  videoComplete: boolean;
  disclaimerComplete: boolean;
  paperAcknowledged: boolean;
  strategyAccessAllowed: boolean;
  demoConnectionAllowed: boolean;
}): number {
  let level = 0;
  if (params.eligible) level = Math.max(level, 10);
  if (params.optedIn) level = Math.max(level, 25);
  if (params.videoComplete) level = Math.max(level, 40);
  if (params.disclaimerComplete) level = Math.max(level, 55);
  if (params.paperAcknowledged) level = Math.max(level, 70);
  if (params.strategyAccessAllowed) level = Math.max(level, 80);
  if (params.demoConnectionAllowed) level = Math.max(level, 90);
  return level;
}

async function upsertAccessRow(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    userId: string;
    existing: AccessRow | null;
    eligible: boolean;
    accessStatus: 'locked' | 'eligible_pending' | 'in_progress' | 'ready' | 'unlocked';
    introVideoUrl: string | null;
    tradingAccessTier: TradingAccessSnapshot['trading_access_tier'];
    tradingStage: TradingAccessSnapshot['trading_stage'];
    adminLabEnabled: boolean;
    strategyAccessAllowed: boolean;
    demoConnectionAllowed: boolean;
    tradingLevel: number;
  }
): Promise<AccessRow> {
  const payload = {
    tenant_id: input.tenantId,
    user_id: input.userId,
    feature_key: ADVANCED_TRADING_FEATURE,
    eligibility_status: input.eligible ? 'eligible' : 'ineligible',
    unlocked_by_rule: input.eligible,
    opted_in: Boolean(input.existing?.opted_in),
    opted_in_at: input.existing?.opted_in_at || null,
    intro_video_url: input.existing?.intro_video_url || input.introVideoUrl,
    intro_video_watched_at: input.existing?.intro_video_watched_at || null,
    disclaimer_version: String(input.existing?.disclaimer_version || DEFAULT_DISCLAIMER_VERSION),
    disclaimer_accepted_at: input.existing?.disclaimer_accepted_at || null,
    paper_trading_acknowledged: Boolean(input.existing?.paper_trading_acknowledged),
    access_status: input.accessStatus,
    trading_access_tier: input.tradingAccessTier,
    trading_stage: input.tradingStage,
    admin_lab_enabled: input.adminLabEnabled,
    strategy_access_allowed: input.strategyAccessAllowed,
    demo_connection_allowed: input.demoConnectionAllowed,
    trading_level: input.tradingLevel,
    metadata: input.existing?.metadata || {},
  };

  const { data, error } = await supabase
    .from('user_advanced_access')
    .upsert(payload, { onConflict: 'tenant_id,user_id,feature_key' })
    .select(
      'tenant_id,user_id,feature_key,eligibility_status,unlocked_by_rule,opted_in,opted_in_at,intro_video_url,intro_video_watched_at,disclaimer_version,disclaimer_accepted_at,paper_trading_acknowledged,access_status,trading_access_tier,trading_stage,admin_lab_enabled,strategy_access_allowed,demo_connection_allowed,trading_level,metadata,updated_at'
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Unable to save trading access state.');
  }

  return data as AccessRow;
}

async function reconcileTradingTasks(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    eligible: boolean;
    optedIn: boolean;
    videoComplete: boolean;
    disclaimerComplete: boolean;
    accessReady: boolean;
  }
): Promise<void> {
  if (!params.eligible) return;

  const rows = [
    {
      tenant_id: params.tenantId,
      task_id: 'adv_trading_opt_in',
      title: 'Optional: Enable Advanced Trading Education',
      description: 'Trading is optional. Opt in only after reserve discipline and business-growth positioning are in place.',
      status: params.optedIn ? 'completed' : 'pending',
      due_date: toIsoDatePlusDays(2),
      type: 'education',
      link: '#portal',
      linked_to_goal: true,
      meta: {
        category: 'advanced_trading',
        priority: 'low',
        educational_only: true,
      },
    },
    {
      tenant_id: params.tenantId,
      task_id: 'adv_trading_overview_video',
      title: 'Watch Advanced Trading Overview',
      description: 'Complete the overview before reviewing advanced educational modules.',
      status: params.videoComplete ? 'completed' : 'pending',
      due_date: toIsoDatePlusDays(4),
      type: 'education',
      link: '#portal',
      linked_to_goal: true,
      meta: {
        category: 'advanced_trading',
        priority: 'low',
        educational_only: true,
      },
    },
    {
      tenant_id: params.tenantId,
      task_id: 'adv_trading_disclaimer',
      title: 'Accept Advanced Trading Disclaimer',
      description: 'Confirm educational-only understanding and risk awareness before access.',
      status: params.disclaimerComplete ? 'completed' : 'pending',
      due_date: toIsoDatePlusDays(5),
      type: 'legal',
      link: '/disclaimers',
      linked_to_goal: true,
      meta: {
        category: 'advanced_trading',
        priority: 'low',
        educational_only: true,
      },
    },
    {
      tenant_id: params.tenantId,
      task_id: 'adv_trading_paper_first',
      title: 'Start With Paper Trading',
      description: 'Practice in simulation mode before engaging deeper strategy content.',
      status: params.accessReady ? 'pending' : 'completed',
      due_date: toIsoDatePlusDays(7),
      type: 'education',
      link: '#portal',
      linked_to_goal: true,
      meta: {
        category: 'advanced_trading',
        priority: 'low',
        educational_only: true,
        simulation_first: true,
      },
    },
  ];

  await supabase.from('client_tasks').upsert(rows as any, { onConflict: 'tenant_id,task_id' });
}

export async function buildTradingAccessSnapshot(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    reconcileTasks?: boolean;
  }
): Promise<TradingAccessSnapshot> {
  const [approvedFunding, capitalProfile, allocation, existingAccess, membershipRoles, adminCompat] = await Promise.all([
    hasApprovedFunding(supabase, params.tenantId, params.userId),
    readCapitalProfile(supabase, params.tenantId, params.userId),
    readAllocationChoice(supabase, params.tenantId, params.userId),
    readAccessRow(supabase, params.tenantId, params.userId),
    resolveTenantRoles(supabase, params.tenantId, params.userId),
    supabase.rpc('nexus_is_master_admin_compat').then((res) => res.data).catch(() => false),
  ]);

  const normalizedRoles = membershipRoles.map((role) => String(role || '').toLowerCase());
  const isSuperAdminRole = normalizedRoles.some((role) => role === 'admin' || role === 'super_admin' || role === 'superadmin');
  const isInternalOperatorRole = normalizedRoles.some((role) => role === 'supervisor');
  const isSuperAdmin = Boolean(adminCompat) || isSuperAdminRole;
  const isInternalOperator = isSuperAdmin || isInternalOperatorRole;

  const reserveConfirmed = Boolean(capitalProfile?.reserve_confirmed);
  const setupStatus = String(capitalProfile?.capital_setup_status || 'not_started').toLowerCase();
  const setupComplete = setupStatus === 'ready' || setupStatus === 'completed';
  const capitalProtectionReady = reserveConfirmed || setupComplete;

  const selectedPath = allocation?.selected_path || null;
  const businessGrowthPositioned = Boolean(capitalProfile?.business_growth_positioned) || selectedPath === 'business_growth';

  const blockers: string[] = [];
  if (!approvedFunding) {
    blockers.push('Post-funding status is required before advanced trading access.');
  }
  if (!capitalProtectionReady) {
    blockers.push('Complete capital protection (reserve confirmation) first.');
  }
  if (!businessGrowthPositioned) {
    blockers.push('Business Growth positioning must be completed before optional trading access.');
  }

  const eligible = blockers.length === 0;

  const optedIn = Boolean(existingAccess?.opted_in);
  const videoComplete = Boolean(existingAccess?.intro_video_watched_at);
  const disclaimerVersion = String(existingAccess?.disclaimer_version || DEFAULT_DISCLAIMER_VERSION);
  const disclaimerComplete = Boolean(existingAccess?.disclaimer_accepted_at) && disclaimerVersion.length > 0;
  const baseAccessReady = eligible && optedIn && videoComplete && disclaimerComplete;
  const accessReady = isInternalOperator ? true : baseAccessReady;
  const accessStatus = isInternalOperator ? 'unlocked' : computeAccessStatus({ eligible, optedIn, videoComplete, disclaimerComplete, accessReady });
  const paperAcknowledged = Boolean(existingAccess?.paper_trading_acknowledged);

  const strategyAccessAllowed = isInternalOperator ? true : Boolean(existingAccess?.strategy_access_allowed) || paperAcknowledged;
  const demoConnectionAllowed = isInternalOperator ? true : Boolean(existingAccess?.demo_connection_allowed);

  let tradingAccessTier: TradingAccessSnapshot['trading_access_tier'] = 'client_basic';
  let tradingStage: TradingAccessSnapshot['trading_stage'] = 'education_only';
  let adminLabEnabled = false;

  if (isSuperAdmin) {
    tradingAccessTier = 'super_admin';
    tradingStage = 'admin_lab_full';
    adminLabEnabled = true;
  } else if (isInternalOperator) {
    tradingAccessTier = 'internal_operator';
    tradingStage = 'admin_lab_full';
    adminLabEnabled = true;
  } else if (demoConnectionAllowed) {
    tradingAccessTier = 'client_advanced';
    tradingStage = 'demo_broker_enabled';
  } else if (strategyAccessAllowed) {
    tradingAccessTier = 'client_advanced';
    tradingStage = 'strategy_view';
  } else if (accessReady) {
    tradingAccessTier = 'client_intermediate';
    tradingStage = 'paper_trading';
  } else {
    tradingAccessTier = 'client_basic';
    tradingStage = 'education_only';
  }

  const tradingLevel = isInternalOperator
    ? 100
    : computeTradingLevel({
        eligible,
        optedIn,
        videoComplete,
        disclaimerComplete,
        paperAcknowledged,
        strategyAccessAllowed,
        demoConnectionAllowed,
      });

  const saved = await upsertAccessRow(supabase, {
    tenantId: params.tenantId,
    userId: params.userId,
    existing: existingAccess,
    eligible: isInternalOperator ? true : eligible,
    accessStatus,
    introVideoUrl: defaultIntroVideoUrl(),
    tradingAccessTier,
    tradingStage,
    adminLabEnabled,
    strategyAccessAllowed,
    demoConnectionAllowed,
    tradingLevel,
  });

  if (params.reconcileTasks) {
    await reconcileTradingTasks(supabase, {
      tenantId: params.tenantId,
      userId: params.userId,
      eligible,
      optedIn,
      videoComplete,
      disclaimerComplete,
      accessReady,
    });
  }

  return {
    tenant_id: params.tenantId,
    user_id: params.userId,
    feature_key: ADVANCED_TRADING_FEATURE,
    eligible: isInternalOperator ? true : eligible,
    blockers: isInternalOperator ? [] : blockers,
    unlocked: accessReady,
    opted_in: optedIn,
    video_complete: videoComplete,
    disclaimer_complete: disclaimerComplete,
    access_ready: accessReady,
    access_status: saved.access_status,
    disclaimer_version: disclaimerVersion,
    intro_video_url: saved.intro_video_url,
    intro_video_watched_at: saved.intro_video_watched_at,
    disclaimer_accepted_at: saved.disclaimer_accepted_at,
    selected_allocation_path: selectedPath,
    paper_trading_recommended: true,
    reserve_confirmed: reserveConfirmed,
    business_growth_positioned: businessGrowthPositioned,
    trading_access_tier: saved.trading_access_tier || tradingAccessTier,
    trading_stage: saved.trading_stage || tradingStage,
    admin_lab_enabled: Boolean(saved.admin_lab_enabled ?? adminLabEnabled),
    strategy_access_allowed: Boolean(saved.strategy_access_allowed ?? strategyAccessAllowed),
    demo_connection_allowed: Boolean(saved.demo_connection_allowed ?? demoConnectionAllowed),
    trading_level: Number(saved.trading_level ?? tradingLevel),
    updated_at: saved.updated_at || null,
  };
}

export async function setTradingOptIn(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    optedIn: boolean;
    reconcileTasks?: boolean;
  }
): Promise<TradingAccessSnapshot> {
  const nowIso = new Date().toISOString();
  const patch = {
    tenant_id: params.tenantId,
    user_id: params.userId,
    feature_key: ADVANCED_TRADING_FEATURE,
    opted_in: Boolean(params.optedIn),
    opted_in_at: params.optedIn ? nowIso : null,
  };

  const { error } = await supabase
    .from('user_advanced_access')
    .upsert(patch, { onConflict: 'tenant_id,user_id,feature_key' });

  if (error) {
    throw new Error(error.message || 'Unable to update trading opt-in status.');
  }

  return buildTradingAccessSnapshot(supabase, {
    tenantId: params.tenantId,
    userId: params.userId,
    reconcileTasks: params.reconcileTasks,
  });
}

export async function setTradingVideoComplete(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    completed: boolean;
    introVideoUrl?: string | null;
    reconcileTasks?: boolean;
  }
): Promise<TradingAccessSnapshot> {
  const nowIso = new Date().toISOString();
  const patch = {
    tenant_id: params.tenantId,
    user_id: params.userId,
    feature_key: ADVANCED_TRADING_FEATURE,
    intro_video_watched_at: params.completed ? nowIso : null,
    intro_video_url: String(params.introVideoUrl || '').trim() || defaultIntroVideoUrl(),
  };

  const { error } = await supabase
    .from('user_advanced_access')
    .upsert(patch, { onConflict: 'tenant_id,user_id,feature_key' });

  if (error) {
    throw new Error(error.message || 'Unable to save intro video completion status.');
  }

  return buildTradingAccessSnapshot(supabase, {
    tenantId: params.tenantId,
    userId: params.userId,
    reconcileTasks: params.reconcileTasks,
  });
}

export async function setTradingDisclaimerAccepted(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    accepted: boolean;
    disclaimerVersion?: string | null;
    reconcileTasks?: boolean;
  }
): Promise<TradingAccessSnapshot> {
  const nowIso = new Date().toISOString();
  const normalizedVersion = String(params.disclaimerVersion || DEFAULT_DISCLAIMER_VERSION).trim() || DEFAULT_DISCLAIMER_VERSION;
  const patch = {
    tenant_id: params.tenantId,
    user_id: params.userId,
    feature_key: ADVANCED_TRADING_FEATURE,
    disclaimer_version: normalizedVersion,
    disclaimer_accepted_at: params.accepted ? nowIso : null,
  };

  const { error } = await supabase
    .from('user_advanced_access')
    .upsert(patch, { onConflict: 'tenant_id,user_id,feature_key' });

  if (error) {
    throw new Error(error.message || 'Unable to save disclaimer acceptance status.');
  }

  return buildTradingAccessSnapshot(supabase, {
    tenantId: params.tenantId,
    userId: params.userId,
    reconcileTasks: params.reconcileTasks,
  });
}

export function toHttpErrorBody(error: unknown) {
  const message = (error as any)?.message || 'Bad Request';
  return {
    statusCode: normalizeErrorStatus(error),
    body: {
      error: String(message),
    },
  };
}
