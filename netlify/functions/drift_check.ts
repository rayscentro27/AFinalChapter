import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const BodySchema = z.object({
  // tenant/client id (optional but required to persist)
  client_id: z.string().uuid().optional(),
  text: z.string().min(1),
});

type Severity = 'none' | 'yellow' | 'orange' | 'red';

const normalize = (s: string) => (s || '').toLowerCase();

function classify(text: string): { severity: Severity; category: string; message: string; matches: string[] } {
  const t = normalize(text);
  const matches: string[] = [];

  const red = [
    /fake\b/, /forge\b/, /forg(e|ery)\b/, /edit\b.*(bank statement|paystub|statement)/,
    /income\s*(inflate|inflation)/,
    /make\s+me\s+approved/, /guarantee(d)?\s+approval/, /bypass\b/, /hack\b/, /fraud\b/,
    /delete\s+it\s+for\s+sure/, /guarantee(d)?\s+deletion/
  ];

  const orange = [
    /legal\s+advice/, /tax\s+advice/, /bankruptcy/, /lien\b/, /lawsuit/, /sue\b/,
    /tell\s+me\s+exactly\s+what\s+to\s+say\s+to\s+the\s+lender\s+to\s+get\s+approved/
  ];

  const yellow = [
    /guarantee/, /approved\s+for\s+sure/, /how\s+fast\s+can\s+i\s+get\s+funded/, /timeline\b/,
  ];

  for (const r of red) if (r.test(t)) matches.push(String(r));
  if (matches.length) {
    return {
      severity: 'red',
      category: 'compliance_deception_or_guarantee',
      message: 'Request indicates deception, bypass, or guarantee-seeking behavior. Human review required.',
      matches,
    };
  }

  for (const r of orange) if (r.test(t)) matches.push(String(r));
  if (matches.length) {
    return {
      severity: 'orange',
      category: 'regulated_or_high_stakes',
      message: 'Request appears regulated/high-stakes (legal/tax/bankruptcy). Route to approval mode or human review.',
      matches,
    };
  }

  for (const r of yellow) if (r.test(t)) matches.push(String(r));
  if (matches.length) {
    return {
      severity: 'yellow',
      category: 'expectations_or_timeline',
      message: 'Request implies expectations/timeline pressure. Use educational framing and avoid guarantees.',
      matches,
    };
  }

  return { severity: 'none', category: 'none', message: 'No drift triggers detected.', matches: [] };
}

async function persist(clientId: string, severity: Exclude<Severity, 'none'>, category: string, message: string) {
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

    if (!process.env.SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const res = classify(body.text);

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
    return json(400, { error: e?.message || 'Bad Request' });
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
