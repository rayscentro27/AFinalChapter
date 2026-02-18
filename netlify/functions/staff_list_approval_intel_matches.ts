import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional().default(200),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['new', 'notified', 'dismissed', 'acted']).optional(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    await requireStaffUser(event);
    const supabase = getUserSupabaseClient(event);
    const qs = QuerySchema.parse(event.queryStringParameters || {});

    let q = supabase
      .from('approval_intel_matches')
      .select('id, tenant_id, intel_post_id, match_score, confidence, recommended_action, status, snapshot, matched_at, updated_at, tenants(name, slug), approval_intel_posts(card_name, source, source_url, source_thread, fico_score, annual_income, instant_approval, credit_limit, captured_at)')
      .order('matched_at', { ascending: false })
      .limit(qs.limit);

    if (qs.confidence) q = q.eq('confidence', qs.confidence);
    if (qs.status) q = q.eq('status', qs.status);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return json(200, {
      ok: true,
      count: (data || []).length,
      matches: data || [],
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
