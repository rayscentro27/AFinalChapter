import type { Handler } from '@netlify/functions';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function base64UrlToBuffer(input: string): Buffer {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

function parseSignedRequest(signedRequest: string, appSecret: string) {
  const parts = String(signedRequest || '').split('.', 2);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Invalid signed_request payload');
  }

  const [encodedSig, encodedPayload] = parts;
  const expected = createHmac('sha256', appSecret).update(encodedPayload).digest();
  const actual = base64UrlToBuffer(encodedSig);

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid signed_request signature');
  }

  const payloadJson = base64UrlToBuffer(encodedPayload).toString('utf8');
  const payload = JSON.parse(payloadJson);
  return payload as { user_id?: string; issued_at?: number; expires?: number };
}

function getSignedRequest(event: Parameters<Handler>[0]): string {
  const body = String(event.body || '').trim();
  if (!body) return '';

  const contentType = String(event.headers?.['content-type'] || event.headers?.['Content-Type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(body);
      return String(parsed?.signed_request || '').trim();
    } catch {
      return '';
    }
  }

  try {
    return String(new URLSearchParams(body).get('signed_request') || '').trim();
  } catch {
    return '';
  }
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { ok: false, error: 'method_not_allowed' });
    }

    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      return json(500, { ok: false, error: 'server_misconfigured_missing_meta_app_secret' });
    }

    const signedRequest = getSignedRequest(event);
    if (!signedRequest) {
      return json(400, { ok: false, error: 'missing_signed_request' });
    }

    const parsed = parseSignedRequest(signedRequest, appSecret);
    const userId = String(parsed.user_id || '').trim();
    if (!userId) {
      return json(400, { ok: false, error: 'missing_user_id' });
    }

    const confirmationCode = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
    const baseUrl = (process.env.URL || process.env.DEPLOY_URL || process.env.SITE_URL || 'https://goclearonline.cc').replace(/\/$/, '');
    const statusUrl = new URL('/data-deletion', baseUrl);
    statusUrl.searchParams.set('confirmation', confirmationCode);
    statusUrl.searchParams.set('status', 'received');
    statusUrl.searchParams.set('user', userId.slice(-8));

    try {
      const admin = getAdminSupabaseClient();
      await admin.from('audit_logs').insert({
        actor_id: userId,
        actor_type: 'external',
        action: 'user_data_deletion_requested',
        entity_type: 'meta_app_scoped_user',
        entity_id: userId,
        details: {
          confirmation_code: confirmationCode,
          status_url: statusUrl.toString(),
          issued_at: parsed.issued_at || null,
          expires: parsed.expires || null,
          received_at: new Date().toISOString(),
        },
      });
    } catch (auditError) {
      console.warn('facebook-data-deletion: audit log failed', auditError);
    }

    return json(200, {
      url: statusUrl.toString(),
      confirmation_code: confirmationCode,
    });
  } catch (error: any) {
    return json(400, {
      ok: false,
      error: String(error?.message || 'bad_request'),
    });
  }
};
