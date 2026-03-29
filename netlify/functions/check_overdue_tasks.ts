import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';

export const config = {
  schedule: '0 */4 * * *',
};

const QuerySchema = z.object({
  days_overdue: z.coerce.number().int().min(0).max(365).optional().default(0),
});

function isScheduledInvocation(event: Parameters<Handler>[0]) {
  const h = event.headers || {};
  const nf = Object.entries(h).find(([k]) => k.toLowerCase() === 'x-nf-event')?.[1];
  return String(nf || '').toLowerCase() === 'schedule';
}

export const handler: Handler = async (event) => {
  try {
    if (!['POST', 'GET'].includes(event.httpMethod || '')) {
      return json(405, { error: 'Method not allowed' });
    }

    const scheduled = isScheduledInvocation(event);
    const expectedToken = process.env.CRON_SHARED_TOKEN || '';
    const gotToken = Object.entries(event.headers || {}).find(([k]) => k.toLowerCase() === 'x-cron-token')?.[1] || '';

    if (!scheduled && expectedToken && gotToken !== expectedToken) {
      return json(401, { error: 'Unauthorized' });
    }

    const qs = QuerySchema.parse(event.queryStringParameters || {});
    const admin = getAdminSupabaseClient();

    const { data, error } = await admin.rpc('emit_overdue_task_alerts', { p_days_overdue: qs.days_overdue });
    if (error) throw new Error(error.message);

    return json(200, {
      ok: true,
      scheduled,
      days_overdue: qs.days_overdue,
      result: data,
      ran_at: new Date().toISOString(),
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
