import type { Handler } from '@netlify/functions';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { assertOracleProxyConfig } from './_shared/oracle_proxy';

export const config = {
  schedule: '*/10 * * * *',
};

const MAX_PER_RUN = 50;

export const handler: Handler = async (event) => {
  try {
    const isScheduled = String(event.headers?.['x-nf-event'] || '').toLowerCase() === 'schedule';
    if (!isScheduled) {
      return json(403, { ok: false, error: 'Forbidden' });
    }

    const supabase = getAdminSupabaseClient();
    const { baseUrl, apiKey } = assertOracleProxyConfig();

    const now = new Date().toISOString();
    const { data: rows, error: listError } = await supabase
      .from('webhook_dead_letters')
      .select('id, endpoint, payload, attempts')
      .is('resolved_at', null)
      .lte('next_retry_at', now)
      .order('next_retry_at', { ascending: true })
      .limit(MAX_PER_RUN);

    if (listError) throw listError;

    let processed = 0;
    let succeeded = 0;

    for (const row of rows || []) {
      const endpoint = String(row.endpoint || '').trim();
      if (!endpoint.startsWith('/')) {
        await markFailed(supabase, row.id, Number(row.attempts || 0), 'Replay skipped: invalid endpoint');
        processed += 1;
        continue;
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
      const attempts = Number(row.attempts || 0) + 1;

      if (response.ok) {
        const { error: updateError } = await supabase
          .from('webhook_dead_letters')
          .update({
            attempts,
            error: null,
            next_retry_at: null,
            resolved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        if (updateError) throw updateError;
        succeeded += 1;
      } else {
        await markFailed(
          supabase,
          row.id,
          attempts - 1,
          `Replay failed: HTTP ${response.status} ${text}`.slice(0, 5000)
        );
      }

      processed += 1;
    }

    return json(200, { ok: true, processed, succeeded });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message || String(e) });
  }
};

async function markFailed(supabase: any, id: number, priorAttempts: number, message: string) {
  const attempts = Number(priorAttempts || 0) + 1;
  const nextRetryMinutes = Math.min(60, 5 * attempts);

  await supabase
    .from('webhook_dead_letters')
    .update({
      attempts,
      error: message,
      next_retry_at: new Date(Date.now() + nextRetryMinutes * 60000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
