import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';

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
  user_id: z.string().uuid(),
  portal_message_opt_in: z.boolean().optional(),
  email_opt_in: z.boolean().optional(),
  phone_e164: z.string().optional().nullable(),
  similarity_threshold: z.number().int().min(0).max(100).optional(),
  thresholds: ThresholdsSchema,
  consent_captured_at: z.string().datetime({ offset: true }).optional(),
});

const DEFAULT_THRESHOLDS = {
  fico_delta: 15,
  inquiries_6_12_delta: 1,
  inquiries_12_24_delta: 2,
  oldest_account_months_delta: 24,
  income_min_ratio: 0.8,
  actionable_similarity_min: 75,
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const phone = (body.phone_e164 || '').trim() || null;
    const portalMessageOptIn = Boolean(body.portal_message_opt_in ?? false);
    const emailOptIn = Boolean(body.email_opt_in ?? false);

    const mergedThresholds = {
      ...DEFAULT_THRESHOLDS,
      ...(body.thresholds || {}),
    };

    const supabase = getAdminSupabaseClient();
    const payload = {
      tenant_id: body.tenant_id,
      user_id: body.user_id,
      portal_message_opt_in: portalMessageOptIn,
      email_opt_in: emailOptIn,
      phone_e164: phone,
      similarity_threshold:
        body.similarity_threshold ?? mergedThresholds.actionable_similarity_min ?? DEFAULT_THRESHOLDS.actionable_similarity_min,
      thresholds: mergedThresholds,
      consent_captured_at:
        portalMessageOptIn
          ? body.consent_captured_at || new Date().toISOString()
          : body.consent_captured_at || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('client_alert_prefs')
      .upsert(payload, { onConflict: 'tenant_id,user_id' })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    return json(200, {
      ok: true,
      prefs: data,
      compliance: {
        consent_required: true,
        portal_message_opt_in: Boolean((data as any)?.portal_message_opt_in),
        email_opt_in: Boolean((data as any)?.email_opt_in),
      },
    });
  } catch (e: any) {
    return json(400, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
