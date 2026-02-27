import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { assertOracleProxyConfig } from './_shared/oracle_proxy';

const BodySchema = z.object({
  id: z.number().int().positive(),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const supabase = getUserSupabaseClient(event);
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user?.id) return json(401, { error: 'Unauthorized' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const { data: row, error: rowError } = await supabase
      .from('webhook_dead_letters')
      .select('id,tenant_id,provider,endpoint,payload,error,attempts,next_retry_at,resolved_at')
      .eq('id', body.id)
      .single();

    if (rowError || !row) return json(404, { error: 'Dead-letter record not found' });
    if (row.resolved_at) return json(200, { ok: true, note: 'Already resolved' });

    const { baseUrl, apiKey } = assertOracleProxyConfig();
    const endpoint = String(row.endpoint || '').trim();
    if (!endpoint.startsWith('/')) {
      return json(400, { error: 'Stored endpoint is invalid for replay' });
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-replay': 'deadletter',
      },
      body: JSON.stringify(row.payload || {}),
    });

    const text = await response.text().catch(() => '');
    const ok = response.ok;

    const attempts = Number(row.attempts || 0) + 1;
    const nextRetryMinutes = Math.min(60, 5 * attempts);

    const patch = ok
      ? {
          attempts,
          error: null,
          next_retry_at: null,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : {
          attempts,
          error: `Replay failed: HTTP ${response.status} ${text}`.slice(0, 5000),
          next_retry_at: new Date(Date.now() + nextRetryMinutes * 60000).toISOString(),
          updated_at: new Date().toISOString(),
        };

    const { error: updateError } = await supabase
      .from('webhook_dead_letters')
      .update(patch)
      .eq('id', row.id);

    if (updateError) throw updateError;

    return json(ok ? 200 : 502, {
      ok,
      status: response.status,
      response: text || null,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
