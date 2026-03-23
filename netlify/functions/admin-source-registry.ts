import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { asText, safeRows, sourceResponseRow } from './_shared/admin_local_state';
import { proxyToOracle } from './_shared/oracle_proxy';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  status: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  source_id: z.string().min(1).optional(),
});

const AddBodySchema = z.object({
  source_type: z.string().min(1),
  url: z.string().url(),
  label: z.string().min(1),
  priority: z.number().int().min(0).max(100),
});

const ActionBodySchema = z.object({
  source_id: z.string().min(1),
  action: z.enum(['activate', 'deactivate', 'scan_now', 'set_priority', 'pause', 'resume', 'pause_schedule', 'resume_schedule']),
  priority: z.number().int().min(0).max(100).optional(),
});

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      await requireStaffUser(event);
      const query = QuerySchema.parse({
        limit: event.queryStringParameters?.limit,
        status: event.queryStringParameters?.status,
        type: event.queryStringParameters?.type,
        query: event.queryStringParameters?.query,
        source_id: event.queryStringParameters?.source_id,
      });
      const supabase = getAdminSupabaseClient();
      const local = await safeRows<Record<string, unknown>>(
        supabase
          .from('research_sources')
          .select('id,source_type,label,canonical_url,domain,status,priority,active,paused,schedule_paused,schedule_status,last_run_at,next_run_at,last_run_status,created_at')
          .order('priority', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(query.limit || 100),
      );

      if (!local.missing && !local.error) {
        const duplicateRows = await safeRows<Record<string, unknown>>(
          supabase
            .from('source_duplicates')
            .select('source_id,duplicate_reason,status')
            .eq('status', 'open')
            .limit(200),
        );
        const recommendationRows = await safeRows<Record<string, unknown>>(
          supabase
            .from('source_recommendations')
            .select('canonical_url,status,rationale')
            .in('status', ['open', 'queued'])
            .limit(200),
        );
        const healthRows = await safeRows<Record<string, unknown>>(
          supabase
            .from('source_health_scores')
            .select('source_id,score,error_count,period_end')
            .order('period_end', { ascending: false })
            .limit(500),
        );

        let items = local.rows.map((row) => {
          const warnings = [
            ...duplicateRows.rows.filter((item) => asText(item.source_id) === asText(row.id)).map((item) => asText(item.duplicate_reason || 'Potential duplicate source detected.')),
            ...recommendationRows.rows.filter((item) => asText(item.canonical_url) === asText(row.canonical_url)).map((item) => asText(item.rationale || 'Recommendation still pending review.')),
          ];
          const latestHealth = healthRows.rows.find((item) => asText(item.source_id) === asText(row.id));
          if (latestHealth && Number(latestHealth.score || 100) < 80) {
            warnings.push(`Health score ${Number(latestHealth.score || 0).toFixed(0)} with ${Number(latestHealth.error_count || 0)} errors in recent window.`);
          }
          return sourceResponseRow(row, warnings);
        });

        if (query.status) items = items.filter((item) => item.status.toLowerCase() === query.status?.toLowerCase());
        if (query.type) items = items.filter((item) => item.source_type.toLowerCase() === query.type?.toLowerCase());
        if (query.source_id) items = items.filter((item) => item.id === query.source_id);
        if (query.query) {
          const search = query.query.toLowerCase();
          items = items.filter((item) => [item.label, item.url, item.domain].some((value) => String(value || '').toLowerCase().includes(search)));
        }

        if (items.length > 0) {
          return json(200, { ok: true, items, count: items.length, source: 'supabase' });
        }
      }

      const proxied = await proxyToOracle({ path: '/admin/source-registry', method: 'GET', query, forwardAuth: true, event });
      return json(proxied.status, proxied.json || {});
    }

    if (event.httpMethod === 'POST') {
      await requireStaffUser(event);
      const body = AddBodySchema.parse(JSON.parse(event.body || '{}'));
      const supabase = getAdminSupabaseClient();
      let domain = '';
      try {
        domain = new URL(body.url).hostname;
      } catch {
        domain = '';
      }

      const { data, error } = await supabase
        .from('research_sources')
        .insert({
          source_type: body.source_type,
          label: body.label.trim(),
          canonical_url: body.url.trim(),
          domain,
          status: 'active',
          priority: body.priority,
          active: true,
          paused: false,
          schedule_paused: false,
          schedule_status: 'scheduled',
          last_run_status: 'new',
          metadata: { source: 'windows_admin_source_registry' },
        })
        .select('id,source_type,label,canonical_url,domain,status,priority,active,paused,schedule_paused,schedule_status,last_run_at,next_run_at,last_run_status,created_at')
        .single();

      if (error) throw new Error(error.message);

      return json(200, { ok: true, item: sourceResponseRow((data || {}) as Record<string, unknown>), source: 'supabase' });
    }

    if (event.httpMethod === 'PATCH') {
      await requireStaffUser(event);
      const body = ActionBodySchema.parse(JSON.parse(event.body || '{}'));
      const supabase = getAdminSupabaseClient();
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { updated_at: now };

      if (body.action === 'activate') {
        patch.active = true;
        patch.paused = false;
        patch.status = 'active';
      } else if (body.action === 'deactivate') {
        patch.active = false;
        patch.paused = false;
        patch.status = 'inactive';
      } else if (body.action === 'scan_now') {
        patch.last_run_at = now;
        patch.last_run_status = 'manual_requested';
      } else if (body.action === 'set_priority') {
        patch.priority = body.priority ?? 50;
      } else if (body.action === 'pause') {
        patch.paused = true;
        patch.status = 'paused';
      } else if (body.action === 'resume') {
        patch.paused = false;
        patch.status = 'active';
      } else if (body.action === 'pause_schedule') {
        patch.schedule_paused = true;
        patch.schedule_status = 'paused';
      } else if (body.action === 'resume_schedule') {
        patch.schedule_paused = false;
        patch.schedule_status = 'scheduled';
      }

      const { data, error } = await supabase
        .from('research_sources')
        .update(patch)
        .eq('id', body.source_id)
        .select('id,source_type,label,canonical_url,domain,status,priority,active,paused,schedule_paused,schedule_status,last_run_at,next_run_at,last_run_status,created_at')
        .single();

      if (error) throw new Error(error.message);

      return json(200, { ok: true, item: sourceResponseRow((data || {}) as Record<string, unknown>), source: 'supabase' });
    }

    return json(405, { ok: false, error: 'method_not_allowed' });
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};