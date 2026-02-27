import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { getOracleProxyConfig } from './_shared/oracle_proxy';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
});

function getHeader(headers: Record<string, string | undefined> | undefined, name: string): string {
  const target = String(name || '').toLowerCase();
  const hit = Object.entries(headers || {}).find(([k]) => String(k || '').toLowerCase() === target)?.[1];
  return String(hit || '').trim();
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const { baseUrl, apiKey } = getOracleProxyConfig();
    if (!baseUrl || !apiKey) {
      return json(500, { ok: false, error: 'missing_oracle_proxy_env' });
    }

    const query = QuerySchema.parse({
      tenant_id: event.queryStringParameters?.tenant_id,
    });

    const contentType = getHeader(event.headers as any, 'content-type');
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return json(400, { ok: false, error: 'multipart_content_type_required' });
    }

    const url = new URL(`${baseUrl.replace(/\/$/, '')}/attachments/upload`);
    url.searchParams.set('tenant_id', query.tenant_id);

    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      'Content-Type': contentType,
    };

    const auth = getHeader(event.headers as any, 'authorization');
    if (auth) headers.Authorization = auth;

    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: bodyBuffer,
    });

    const text = await response.text();
    let payload: any = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { ok: response.ok, raw: text };
    }

    return json(response.status, payload);
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    return json(statusCode, { ok: false, error: String(error?.message || 'bad_request') });
  }
};
