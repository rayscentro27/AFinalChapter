import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { requireStaffUser } from './_shared/staff_auth';

const PostSchema = z.object({
  source: z.string().min(1).optional(),
  source_thread: z.string().optional(),
  source_url: z.string().url().optional(),
  source_post_id: z.string().optional(),

  applied_at: z.string().datetime().optional(),
  captured_at: z.string().datetime().optional(),

  card_name: z.string().min(1),
  bureau: z.string().optional(),
  fico_score: z.number().int().min(300).max(900).optional(),

  inquiries_6_12: z.number().int().min(0).optional(),
  inquiries_12_24: z.number().int().min(0).optional(),
  inquiries_24_24: z.number().int().min(0).optional(),

  new_accounts_6_12: z.number().int().min(0).optional(),
  new_accounts_12_24: z.number().int().min(0).optional(),

  oldest_account_age_months: z.number().int().min(0).optional(),
  annual_income: z.number().int().min(0).optional(),
  business_age_days: z.number().int().min(0).optional(),
  revenue_annual: z.number().int().min(0).optional(),

  instant_approval: z.boolean().optional(),
  credit_limit: z.number().int().min(0).optional(),

  screenshot_url: z.string().url().optional(),
  screenshot_verified: z.boolean().optional().default(false),

  notes: z.string().optional(),
  raw_payload: z.record(z.string(), z.unknown()).optional(),
});

const BodySchema = z
  .object({
    source: z.string().min(1).optional().default('manual'),
    post: PostSchema.optional(),
    posts: z.array(PostSchema).optional(),
    run_match: z.coerce.boolean().optional().default(true),
    match_hours: z.coerce.number().int().min(1).max(168).optional().default(48),
  })
  .refine((v) => !!v.post || (Array.isArray(v.posts) && v.posts.length > 0), {
    message: 'Provide post or posts',
  });

function deterministicPostId(input: {
  source: string;
  source_url?: string;
  source_thread?: string;
  card_name: string;
  fico_score?: number;
  annual_income?: number;
  applied_at?: string;
  credit_limit?: number;
}) {
  const payload = JSON.stringify({
    source: input.source,
    source_url: input.source_url || null,
    source_thread: input.source_thread || null,
    card_name: input.card_name,
    fico_score: input.fico_score ?? null,
    annual_income: input.annual_income ?? null,
    applied_at: input.applied_at ?? null,
    credit_limit: input.credit_limit ?? null,
  });
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 32);
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const admin = getAdminSupabaseClient();
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const ingestToken = Object.entries(event.headers || {}).find(([k]) => k.toLowerCase() === 'x-intel-ingest-token')?.[1];
    const expectedToken = process.env.INTEL_INGEST_TOKEN || '';

    let createdBy: string | null = null;
    if (expectedToken && ingestToken && ingestToken === expectedToken) {
      createdBy = null;
    } else {
      const staff = await requireStaffUser(event);
      createdBy = staff.userId;
    }

    const posts = (body.posts && body.posts.length > 0 ? body.posts : body.post ? [body.post] : []).map((p) => ({
      ...p,
      source: p.source || body.source,
    }));

    let inserted = 0;
    let updated = 0;

    for (const p of posts) {
      const source_post_id =
        (p.source_post_id || '').trim() ||
        deterministicPostId({
          source: p.source || body.source,
          source_url: p.source_url,
          source_thread: p.source_thread,
          card_name: p.card_name,
          fico_score: p.fico_score,
          annual_income: p.annual_income,
          applied_at: p.applied_at,
          credit_limit: p.credit_limit,
        });

      const source = p.source || body.source;

      const { data: existing } = await admin
        .from('approval_intel_posts')
        .select('id')
        .eq('source', source)
        .eq('source_post_id', source_post_id)
        .maybeSingle();

      const row = {
        source,
        source_thread: p.source_thread || null,
        source_url: p.source_url || null,
        source_post_id,

        applied_at: p.applied_at || null,
        captured_at: p.captured_at || null,

        card_name: p.card_name,
        bureau: p.bureau || null,
        fico_score: p.fico_score ?? null,

        inquiries_6_12: p.inquiries_6_12 ?? null,
        inquiries_12_24: p.inquiries_12_24 ?? null,
        inquiries_24_24: p.inquiries_24_24 ?? null,

        new_accounts_6_12: p.new_accounts_6_12 ?? null,
        new_accounts_12_24: p.new_accounts_12_24 ?? null,

        oldest_account_age_months: p.oldest_account_age_months ?? null,
        annual_income: p.annual_income ?? null,
        business_age_days: p.business_age_days ?? null,
        revenue_annual: p.revenue_annual ?? null,

        instant_approval: p.instant_approval ?? null,
        credit_limit: p.credit_limit ?? null,

        screenshot_url: p.screenshot_url || null,
        screenshot_verified: p.screenshot_verified ?? false,

        notes: p.notes || null,
        raw_payload: p.raw_payload || {},
        created_by: createdBy,
      };

      const { error } = await admin.from('approval_intel_posts').upsert(row as any, {
        onConflict: 'source,source_post_id',
      });

      if (error) throw new Error(`Failed to upsert approval intel row (${source_post_id}): ${error.message}`);

      if (existing?.id) updated += 1;
      else inserted += 1;
    }

    let matchResult: any = null;
    if (body.run_match) {
      const { data, error } = await admin.rpc('match_approval_intel_recent', { p_hours: body.match_hours });
      if (error) throw new Error(`Matching failed: ${error.message}`);
      matchResult = data;
    }

    return json(200, {
      ok: true,
      posts_received: posts.length,
      inserted,
      updated,
      match_ran: body.run_match,
      match_result: matchResult,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}
