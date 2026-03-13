import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';

const SignalSchema = z.object({
  fico: z.number().optional(),
  inquiries_6_12: z.number().optional(),
  inquiries_12_24: z.number().optional(),
  oldest_account_months: z.number().optional(),
  total_income_annual: z.number().optional(),
});

const DatapointSchema = z.object({
  source_name: z.string().min(1),
  source_type: z.string().optional(),
  community_context: z.string().optional(),
  profile_signals: SignalSchema,

  screenshot_urls: z.array(z.string().url()).optional(),
  screenshot_verified: z.literal(true),
  redaction_confirmed: z.literal(true),
  verification_notes: z.string().optional(),

  reported_at: z.string().datetime({ offset: true }).optional(),
  expires_at: z.string().datetime({ offset: true }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  created_by_user_id: z.string().uuid(),
  datapoint: DatapointSchema,
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const dp = body.datapoint;

    // Option B: manual intake only + verified/redacted screenshot evidence required.
    if (dp.screenshot_verified !== true || dp.redaction_confirmed !== true) {
      return json(400, {
        error: 'Datapoint must be screenshot_verified=true and redaction_confirmed=true before intake.',
      });
    }

    const profileSignals = {
      fico: toNumber(dp.profile_signals.fico),
      inquiries_6_12: toNumber(dp.profile_signals.inquiries_6_12),
      inquiries_12_24: toNumber(dp.profile_signals.inquiries_12_24),
      oldest_account_months: toNumber(dp.profile_signals.oldest_account_months),
      total_income_annual: toNumber(dp.profile_signals.total_income_annual),
    };

    const payload = {
      tenant_id: body.tenant_id,
      created_by_user_id: body.created_by_user_id,
      source_name: dp.source_name.trim(),
      source_type: dp.source_type?.trim() || null,
      community_context: dp.community_context?.trim() || null,
      profile_signals: profileSignals,
      payload: {
        ...dp,
        metadata: dp.metadata || {},
      },
      screenshot_urls: dp.screenshot_urls || [],
      screenshot_verified: true,
      redaction_confirmed: true,
      manual_entry: true,
      verification_notes: dp.verification_notes || '',
      reported_at: dp.reported_at || null,
      expires_at: dp.expires_at || null,
    };

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('credit_intel_datapoints')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    return json(200, {
      ok: true,
      datapoint: data,
      compliance: {
        manual_only: true,
        screenshot_verified: true,
        redaction_confirmed: true,
      },
    });
  } catch (e: any) {
    return json(400, { error: e?.message || 'Bad Request' });
  }
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
