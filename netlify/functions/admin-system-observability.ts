import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { proxyToOracle } from './_shared/oracle_proxy';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  tenant_id: z.string().uuid(),
  hours: z.coerce.number().int().min(1).max(720).optional(),
});

type PanelResult = {
  ok: boolean;
  status: number;
  data: any;
  error: string | null;
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

async function fetchPanel(path: string, query: Record<string, unknown>): Promise<PanelResult> {
  try {
    const proxied = await proxyToOracle({
      path,
      method: 'GET',
      query,
    });

    return {
      ok: proxied.ok,
      status: proxied.status,
      data: proxied.json || {},
      error: proxied.ok ? null : asText((proxied.json as any)?.error || proxied.text || `upstream_${proxied.status}`),
    };
  } catch (error: any) {
    return {
      ok: false,
      status: Number(error?.statusCode) || 500,
      data: {},
      error: asText(error?.message || 'upstream_request_failed'),
    };
  }
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

    await requireStaffUser(event);

    const query = QuerySchema.parse({
      tenant_id: event.queryStringParameters?.tenant_id,
      hours: event.queryStringParameters?.hours,
    });

    const hours = Number(query.hours || 24);

    const [
      health,
      jobs,
      workers,
      errors,
      usage,
      ingestion,
      opportunities,
      videoWorker,
    ] = await Promise.all([
      fetchPanel('/api/system/health', {}),
      fetchPanel('/api/system/jobs', { tenant_id: query.tenant_id, limit: 100 }),
      fetchPanel('/api/system/workers', { limit: 100 }),
      fetchPanel('/api/system/errors', { hours, limit: 100 }),
      fetchPanel('/api/system/usage', { hours }),
      fetchPanel('/api/system/ingestion', { hours }),
      fetchPanel('/api/system/opportunities', { tenant_id: query.tenant_id, hours }),
      fetchPanel('/api/system/video-worker', { tenant_id: query.tenant_id, hours }),
    ]);

    const panels = {
      health,
      jobs,
      workers,
      errors,
      usage,
      ingestion,
      opportunities,
      video_worker: videoWorker,
    };

    const warnings = Object.entries(panels)
      .filter(([, panel]) => !panel.ok)
      .map(([name, panel]) => `${name}: ${panel.error || 'unavailable'}`);

    return json(200, {
      ok: true,
      tenant_id: query.tenant_id,
      hours,
      panels,
      warnings,
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 400;
    return json(statusCode, { ok: false, error: asText(error?.message || 'bad_request') });
  }
};
