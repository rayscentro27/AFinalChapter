import type { Handler } from '@netlify/functions';
import { z } from 'zod';

const ContactSchema = z.object({
  email: z.string().email(),
  name: z.string().optional().default(''),
  company: z.string().optional().default(''),
  status: z.string().optional().default(''),
  revenue: z.number().nullable().optional(),
});

const BodySchema = z.object({
  groupId: z.string().optional(),
  contacts: z.array(ContactSchema).min(1),
});

const MAILERLITE_API_BASE = 'https://api.mailerlite.com/api/v2';

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const apiKey = String(process.env.MAILERLITE_API_KEY || '').trim();
    if (!apiKey) {
      return json(500, { error: 'Server misconfigured: missing MAILERLITE_API_KEY' });
    }

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const groupId = String(body.groupId || process.env.MAILERLITE_GROUP_ID || '').trim();
    if (!groupId) {
      return json(400, { error: 'Missing MailerLite groupId (request.groupId or MAILERLITE_GROUP_ID)' });
    }

    let successful = 0;
    let failed = 0;
    const errors: { email: string; error: string }[] = [];

    for (const contact of body.contacts) {
      const payload = {
        email: contact.email,
        name: contact.name,
        fields: {
          company: contact.company || '',
          status: contact.status || '',
          revenue: contact.revenue != null ? String(contact.revenue) : '0',
        },
      };

      try {
        const response = await fetch(`${MAILERLITE_API_BASE}/groups/${encodeURIComponent(groupId)}/subscribers`, {
          method: 'POST',
          headers: {
            'X-MailerLite-ApiKey': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          successful++;
          continue;
        }

        const text = await response.text();
        let message = text || `MailerLite request failed (${response.status})`;
        try {
          const parsed = JSON.parse(text);
          const candidate = parsed?.error?.message || parsed?.message;
          if (typeof candidate === 'string' && candidate.trim()) message = candidate;
        } catch {
          // Keep raw text when body is not JSON.
        }

        if (/already (exists|subscribed)|duplicate/i.test(message)) {
          successful++;
          continue;
        }

        failed++;
        errors.push({ email: contact.email, error: message });
      } catch (err: any) {
        failed++;
        errors.push({ email: contact.email, error: err?.message || 'Unknown error' });
      }
    }

    return json(200, {
      ok: true,
      total: body.contacts.length,
      successful,
      failed,
      errors: errors.slice(0, 25),
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
