import { supabase } from '../../lib/supabaseClient';
import { writeAuditLog } from '../../services/auditTrail';

export type JourneyRetentionEventType =
  | 'account_created'
  | 'first_login'
  | 'credit_report_uploaded'
  | 'analysis_viewed'
  | 'funding_strategy_viewed'
  | 'funding_readiness_viewed'
  | 'application_started'
  | 'application_outcome_logged'
  | 'grant_section_viewed'
  | 'trading_academy_unlocked'
  | 'referral_prompt_shown'
  | 'referral_link_copied';

export type JourneyRetentionSummary = {
  totalEvents: number;
  counts: Partial<Record<JourneyRetentionEventType, number>>;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  dropOffStage: string;
  completionRate: number;
};

const ORDERED_STAGES: JourneyRetentionEventType[] = [
  'account_created',
  'first_login',
  'credit_report_uploaded',
  'analysis_viewed',
  'funding_strategy_viewed',
  'funding_readiness_viewed',
  'application_started',
  'application_outcome_logged',
  'grant_section_viewed',
  'trading_academy_unlocked',
  'referral_prompt_shown',
  'referral_link_copied',
];

export async function logJourneyRetentionEvent(input: {
  tenantId: string;
  userId?: string;
  eventType: JourneyRetentionEventType;
  metadata?: Record<string, unknown>;
}) {
  try {
    const payload = {
      tenant_id: input.tenantId,
      actor_user_id: input.userId || null,
      actor_type: 'user',
      action: input.eventType,
      event_type: input.eventType,
      entity_type: 'client_journey',
      entity_id: input.userId || input.tenantId,
      metadata: input.metadata || {},
    };

    const insertRes = await supabase.from('audit_events').insert(payload as any);
    if (!insertRes.error) return { ok: true as const };

    const fallback = await writeAuditLog({
      tenant_id: input.tenantId,
      action: input.eventType,
      entity_type: 'client_journey',
      entity_id: input.userId || input.tenantId,
      meta: input.metadata || {},
    });
    if (fallback.ok) return { ok: true as const };
    return { ok: false as const, error: fallback.error || insertRes.error.message };
  } catch (error: any) {
    return { ok: false as const, error: String(error?.message || 'Unable to log retention event.') };
  }
}

export async function getJourneyRetentionSummary(tenantId: string, userId?: string): Promise<JourneyRetentionSummary> {
  const query = supabase
    .from('audit_events')
    .select('action,occurred_at')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'client_journey')
    .order('occurred_at', { ascending: true })
    .limit(500);

  const scopedQuery = userId ? query.eq('actor_user_id', userId) : query;
  const { data, error } = await scopedQuery;
  if (error) throw new Error(error.message || 'Unable to load retention summary.');

  const counts: Partial<Record<JourneyRetentionEventType, number>> = {};
  for (const row of data || []) {
    const key = String((row as any).action || '') as JourneyRetentionEventType;
    counts[key] = (counts[key] || 0) + 1;
  }

  const highestCompletedIndex = ORDERED_STAGES.reduce((highest, key, index) => (
    (counts[key] || 0) > 0 ? index : highest
  ), -1);
  const nextStage = ORDERED_STAGES[Math.min(highestCompletedIndex + 1, ORDERED_STAGES.length - 1)] || 'account_created';
  const completionRate = Math.round(((highestCompletedIndex + 1) / ORDERED_STAGES.length) * 100);

  return {
    totalEvents: (data || []).length,
    counts,
    firstSeenAt: data?.[0]?.occurred_at || null,
    lastSeenAt: data?.[(data?.length || 1) - 1]?.occurred_at || null,
    dropOffStage: nextStage,
    completionRate: Number.isFinite(completionRate) ? completionRate : 0,
  };
}
