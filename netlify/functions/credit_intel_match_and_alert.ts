import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';

type Profile = {
  tenant_id: string;
  user_id: string;
  status: string | null;
  fico: number | null;
  inquiries_6_12: number | null;
  inquiries_12_24: number | null;
  oldest_account_months: number | null;
  total_income_annual: number | null;
  case_complexity: string | null;
  recent_denials?: boolean | null;
  phone_e164?: string | null;
};

type Datapoint = {
  id: string;
  tenant_id: string;
  source_name: string;
  profile_signals: Record<string, unknown> | null;
  screenshot_verified: boolean;
  redaction_confirmed: boolean;
  created_at: string;
};

type AlertPrefs = {
  tenant_id: string;
  user_id: string;
  portal_message_opt_in?: boolean | null;
  email_opt_in?: boolean | null;
  similarity_threshold: number | null;
  thresholds: Record<string, unknown> | null;
};


const ThresholdsSchema = z
  .object({
    fico_delta: z.number().int().min(1).max(200).optional(),
    inquiries_6_12_delta: z.number().int().min(0).max(20).optional(),
    inquiries_12_24_delta: z.number().int().min(0).max(30).optional(),
    oldest_account_months_delta: z.number().int().min(0).max(240).optional(),
    income_min_ratio: z.number().min(0).max(2).optional(),
    actionable_similarity_min: z.number().int().min(0).max(100).optional(),
  })
  .optional();

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  datapoint_id: z.string().uuid().optional(),
  min_similarity: z.number().int().min(0).max(100).optional(),
  thresholds: ThresholdsSchema,
  trigger_user_id: z.string().uuid().optional(),
});

const DEFAULT_THRESHOLDS = {
  fico_delta: 15,
  inquiries_6_12_delta: 1,
  inquiries_12_24_delta: 2,
  oldest_account_months_delta: 24,
  income_min_ratio: 0.8,
  actionable_similarity_min: 75,
};

const READY_STATUS_VALUES = new Set([
  'ready_to_apply',
  'ready to apply',
  'ready',
  'deploy',
]);

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const supabase = getAdminSupabaseClient();

    const datapoints = await fetchDatapoints(supabase, body.tenant_id, body.datapoint_id);
    if (datapoints.length === 0) {
      return json(404, { error: 'No verified datapoints found for matching' });
    }

    const profiles = await fetchReadyProfiles(supabase, body.tenant_id);
    if (profiles.length === 0) {
      return json(200, {
        ok: true,
        summary: {
          datapoints_considered: datapoints.length,
          profiles_considered: 0,
          matches_written: 0,
          alerts_sent: 0,
          blocked_human_review: 0,
          suppressed: 0,
        },
        matches: [],
      });
    }

    const userIds = Array.from(new Set(profiles.map((p) => p.user_id)));
    const prefs = await fetchAlertPrefs(supabase, body.tenant_id, userIds);
    const prefsByUser = new Map<string, AlertPrefs>();
    for (const pref of prefs) prefsByUser.set(pref.user_id, pref);
    const written: any[] = [];
    let alertsSent = 0;
    let blockedHumanReview = 0;
    let suppressed = 0;

    for (const dp of datapoints) {
      const signals = normalizeSignals(dp.profile_signals || {});

      for (const profile of profiles) {
        const pref = prefsByUser.get(profile.user_id);
        const prefThresholds = parseThresholds(pref?.thresholds);
        const mergedThresholds = {
          ...DEFAULT_THRESHOLDS,
          ...prefThresholds,
          ...(body.thresholds || {}),
        };

        const similarity = computeSimilarity(profile, signals, mergedThresholds);
        const actionableMin =
          body.min_similarity ??
          pref?.similarity_threshold ??
          mergedThresholds.actionable_similarity_min ??
          DEFAULT_THRESHOLDS.actionable_similarity_min;

        const reasons: string[] = [];
        if (similarity < actionableMin) {
          reasons.push(`Similarity ${similarity} below actionable threshold ${actionableMin}`);
        }

        const thinProfile = isThinProfile(profile);
        const highRisk =
          String(profile.case_complexity || '').toLowerCase() === 'high' ||
          Boolean(profile.recent_denials) ||
          thinProfile;

        if (highRisk) {
          reasons.push('High-risk timing gate active: Forensic Bot + Human Review required.');
          if (Boolean(profile.recent_denials)) reasons.push('Recent denials present.');
          if (thinProfile) reasons.push('Thin profile indicators detected.');
        }

        let status: 'candidate' | 'alerted' | 'suppressed' | 'blocked_human_review' = 'candidate';
        let humanReviewRequired = false;
        let alertSent = false;
        let alertMessage: string | null = null;
        
        if (similarity >= actionableMin) {
          if (highRisk) {
            status = 'blocked_human_review';
            humanReviewRequired = true;
            blockedHumanReview += 1;
          } else {
            const optedIn = Boolean(pref?.portal_message_opt_in);

            if (!optedIn) {
              status = 'suppressed';
              suppressed += 1;
              reasons.push('Alert not sent: client has not opted in for outreach alerts.');
            } else {
              const message = buildPortalAlertMessage(dp.source_name);
              status = 'alerted';
              alertSent = true;
              alertsSent += 1;
              alertMessage = message;
              reasons.push('Consent-based portal follow-up notification queued.');
            }
          }
        }

        const row = {
          tenant_id: body.tenant_id,
          datapoint_id: dp.id,
          user_id: profile.user_id,
          similarity_score: similarity,
          status,
          thresholds_used: {
            ...mergedThresholds,
            actionable_similarity_min: actionableMin,
          },
          reasons,
          high_risk_gate: highRisk,
          human_review_required: humanReviewRequired,
          alert_sent: alertSent,
          alert_channel: 'portal_message',
          alert_message: alertMessage,
          alerted_at: alertSent ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        };

        const { data: upserted, error } = await supabase
          .from('credit_intel_matches')
          .upsert(row, { onConflict: 'tenant_id,datapoint_id,user_id' })
          .select('*')
          .single();

        if (error) throw new Error(error.message);
        written.push(upserted);
      }
    }

    return json(200, {
      ok: true,
      summary: {
        datapoints_considered: datapoints.length,
        profiles_considered: profiles.length,
        matches_written: written.length,
        alerts_sent: alertsSent,
        blocked_human_review: blockedHumanReview,
        suppressed,
      },
      matches: written,
      safeguards: {
        manual_intake_only: true,
        consent_required: true,
        no_guarantees: true,
      },
    });
  } catch (e: any) {
    return json(400, { error: e?.message || 'Bad Request' });
  }
};

async function fetchDatapoints(supabase: any, tenantId: string, datapointId?: string): Promise<Datapoint[]> {
  let query = supabase
    .from('credit_intel_datapoints')
    .select('id,tenant_id,source_name,profile_signals,screenshot_verified,redaction_confirmed,created_at')
    .eq('tenant_id', tenantId)
    .eq('screenshot_verified', true)
    .eq('redaction_confirmed', true)
    .order('created_at', { ascending: false });

  if (datapointId) query = query.eq('id', datapointId).limit(1);
  else query = query.limit(1);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as Datapoint[];
}

async function fetchReadyProfiles(supabase: any, tenantId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('client_profiles')
    .select(
      'tenant_id,user_id,status,fico,inquiries_6_12,inquiries_12_24,oldest_account_months,total_income_annual,case_complexity,recent_denials'
    )
    .eq('tenant_id', tenantId);

  if (error) throw new Error(error.message);

  return ((data || []) as Profile[]).filter((p) => {
    const status = normalizeStatus(p.status);
    return READY_STATUS_VALUES.has(status);
  });
}

async function fetchAlertPrefs(supabase: any, tenantId: string, userIds: string[]): Promise<AlertPrefs[]> {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from('client_alert_prefs')
    .select('tenant_id,user_id,portal_message_opt_in,email_opt_in,similarity_threshold,thresholds')
    .eq('tenant_id', tenantId)
    .in('user_id', userIds);

  if (error) throw new Error(error.message);
  return (data || []) as AlertPrefs[];
}

function normalizeSignals(raw: Record<string, unknown>) {
  return {
    fico: toNumber(raw.fico),
    inquiries_6_12: toNumber(raw.inquiries_6_12),
    inquiries_12_24: toNumber(raw.inquiries_12_24),
    oldest_account_months: toNumber(raw.oldest_account_months),
    total_income_annual: toNumber(raw.total_income_annual),
  };
}

function parseThresholds(raw: unknown): Partial<typeof DEFAULT_THRESHOLDS> {
  const parsed = ThresholdsSchema.safeParse(raw);
  return parsed.success ? parsed.data || {} : {};
}

function computeSimilarity(
  profile: Profile,
  dp: ReturnType<typeof normalizeSignals>,
  thresholds: typeof DEFAULT_THRESHOLDS
): number {
  const metrics: Array<{ points: number; weight: number } | null> = [
    scoreDelta(profile.fico, dp.fico, thresholds.fico_delta, 30),
    scoreDelta(profile.inquiries_6_12, dp.inquiries_6_12, thresholds.inquiries_6_12_delta, 20),
    scoreDelta(profile.inquiries_12_24, dp.inquiries_12_24, thresholds.inquiries_12_24_delta, 20),
    scoreDelta(profile.oldest_account_months, dp.oldest_account_months, thresholds.oldest_account_months_delta, 20),
    scoreIncome(profile.total_income_annual, dp.total_income_annual, thresholds.income_min_ratio, 10),
  ];

  let score = 0;
  let weight = 0;

  for (const metric of metrics) {
    if (!metric) continue;
    score += metric.points;
    weight += metric.weight;
  }

  if (weight === 0) return 0;
  return Math.max(0, Math.min(100, Number(((score / weight) * 100).toFixed(2))));
}

function scoreDelta(
  profileValue: number | null,
  datapointValue: number | null,
  delta: number,
  metricWeight: number
): { points: number; weight: number } | null {
  const a = toNumber(profileValue);
  const b = toNumber(datapointValue);
  if (a === null || b === null) return null;

  const diff = Math.abs(a - b);
  if (diff <= delta) return { points: metricWeight, weight: metricWeight };

  const cutoff = delta * 3;
  if (diff >= cutoff) return { points: 0, weight: metricWeight };

  const pct = 1 - (diff - delta) / (cutoff - delta);
  return { points: Math.max(0, pct) * metricWeight, weight: metricWeight };
}

function scoreIncome(
  profileIncome: number | null,
  datapointIncome: number | null,
  minRatio: number,
  metricWeight: number
): { points: number; weight: number } | null {
  const pIncome = toNumber(profileIncome);
  const dIncome = toNumber(datapointIncome);

  if (pIncome === null || dIncome === null) return null;
  if (dIncome <= 0) return { points: metricWeight, weight: metricWeight };

  const ratio = pIncome / dIncome;
  if (ratio >= minRatio) return { points: metricWeight, weight: metricWeight };

  const pct = Math.max(0, ratio / minRatio);
  return { points: pct * metricWeight, weight: metricWeight };
}

function isThinProfile(profile: Profile): boolean {
  const oldest = toNumber(profile.oldest_account_months);
  const fico = toNumber(profile.fico);
  return (oldest !== null && oldest < 24) || (fico !== null && fico < 620);
}

function normalizeStatus(status: string | null | undefined): string {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildPortalAlertMessage(sourceName: string): string {
  const source = sourceName?.trim() || 'community source';
  return [
    'Nexus Credit Intel update.',
    `A verified community datapoint from ${source} may be relevant to your readiness profile.`,
    'This is educational information only and not a guarantee of approval, limits, terms, or timing.',
    'Review and respond inside your secure portal inbox.',
  ].join(' ');
}

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
