import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { classifyDrift, type DriftSeverity } from './_shared/drift';
import { requireAuthenticatedUser } from './_shared/staff_auth';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const BodySchema = z.object({
  // tenant/client id (optional but required to persist)
  client_id: z.string().uuid().optional(),
  text: z.string().min(1),
});

async function persist(clientId: string, severity: Exclude<DriftSeverity, 'none'>, category: string, message: string) {
  // Best-effort: persist to drift_alerts + audit_logs.
  try {
    await supabase.from('drift_alerts').insert({
      client_id: clientId,
      severity,
      category,
      message,
    });
  } catch {
    // ignore
  }

  try {
    await supabase.from('audit_logs').insert({
      tenant_id: clientId,
      action: 'drift_alert',
      entity_type: 'tenant',
      entity_id: clientId,
      meta: { severity, category, message },
    });
  } catch {
    // ignore
  }
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    await requireAuthenticatedUser(event);

    if (!process.env.SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const res = classifyDrift(body.text);

    if (body.client_id && res.severity !== 'none') {
      await persist(body.client_id, res.severity, res.category, res.message);
    }

    return json(200, {
      ok: true,
      severity: res.severity,
      category: res.category,
      message: res.message,
      matches: res.matches,
      persisted: Boolean(body.client_id && res.severity !== 'none'),
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}
