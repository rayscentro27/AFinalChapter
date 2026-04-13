import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { resolveTenantId } from './_shared/tenant_resolve';
import {
  resolveAuthedUserId,
  setBusinessProfile,
  toHttpErrorBody,
} from './_shared/funding_foundation';

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  legal_name: z.string().max(200).nullable().optional(),
  entity_type: z.string().max(120).nullable().optional(),
  ein: z.string().max(40).nullable().optional(),
  business_address: z.string().max(300).nullable().optional(),
  business_phone: z.string().max(50).nullable().optional(),
  business_website: z.string().max(300).nullable().optional(),
  naics_code: z.string().max(20).nullable().optional(),
  business_email: z.string().max(200).nullable().optional(),
  mission_statement: z.string().max(1200).nullable().optional(),
  business_plan_summary: z.string().max(2400).nullable().optional(),
  bank_name: z.string().max(200).nullable().optional(),
  account_type: z.string().max(100).nullable().optional(),
  profile_status: z.enum(['not_started', 'in_progress', 'ready', 'completed']).nullable().optional(),
  metadata_patch: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const supabase = getUserSupabaseClient(event);
    const userId = await resolveAuthedUserId(supabase as any);
    const tenantId = await resolveTenantId(supabase as any, { requestedTenantId: body.tenant_id });

    const business = await setBusinessProfile(supabase as any, {
      tenantId,
      userId,
      legalName: body.legal_name,
      entityType: body.entity_type,
      ein: body.ein,
      businessAddress: body.business_address,
      businessPhone: body.business_phone,
      businessWebsite: body.business_website,
      naicsCode: body.naics_code,
      businessEmail: body.business_email,
      missionStatement: body.mission_statement,
      businessPlanSummary: body.business_plan_summary,
      bankName: body.bank_name,
      accountType: body.account_type,
      profileStatus: body.profile_status ?? null,
      metadataPatch: body.metadata_patch ?? null,
    });

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      profile: business.profile,
      progress: business.progress,
      readiness: business.readiness,
      supporting: {
        tax_profile: business.tax_profile,
        banking_profile: business.banking_profile,
        classification_profile: business.classification_profile,
        optimization_profile: business.optimization_profile,
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
