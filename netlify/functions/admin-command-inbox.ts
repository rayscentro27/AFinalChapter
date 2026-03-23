import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { asText, commandResponseRow, safeRows } from './_shared/admin_local_state';
import { proxyToOracle } from './_shared/oracle_proxy';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().min(1).optional(),
  command_id: z.string().min(1).optional(),
});

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });

    await requireStaffUser(event);

    const query = QuerySchema.parse({
      limit: event.queryStringParameters?.limit,
      status: event.queryStringParameters?.status,
      command_id: event.queryStringParameters?.command_id,
    });

    const supabase = getAdminSupabaseClient();
    const local = await safeRows<Record<string, unknown>>(
      supabase
        .from('admin_commands')
        .select('id,command_text,command_type,validation_status,parsed_intent,approval_required,approval_status,queue_handoff_state,execution_outcome,execution_summary,related_source_id,created_at')
        .order('created_at', { ascending: false })
        .limit(query.limit || 20),
    );

    if (!local.missing && !local.error) {
      let items = local.rows.map(commandResponseRow);
      if (query.status) {
        const filter = String(query.status).toLowerCase();
        items = items.filter((item) => [item.status, item.queue_status, item.execution_outcome, item.approval_status].some((value) => String(value).toLowerCase() === filter));
      }

      if (items.length > 0) {
        const selectedId = query.command_id || items[0]?.id || '';
        const selected = local.rows.find((row) => asText(row.id) === selectedId) || local.rows[0] || null;
        let approvals: Array<Record<string, unknown>> = [];
        let agentSummaries: Array<Record<string, unknown>> = [];
        let relatedSource: Record<string, unknown> | null = null;

        if (selected) {
          const [approvalsRes, agentSummariesRes] = await Promise.all([
            safeRows<Record<string, unknown>>(
              supabase
                .from('admin_command_approvals')
                .select('id,decision,reason,approved_at,approver_user_id')
                .eq('command_id', asText(selected.id))
                .order('approved_at', { ascending: true }),
            ),
            safeRows<Record<string, unknown>>(
              supabase
                .from('agent_run_summaries')
                .select('id,agent_name,headline,summary,run_status,created_at')
                .eq('command_id', asText(selected.id))
                .order('created_at', { ascending: false })
                .limit(10),
            ),
          ]);
          approvals = approvalsRes.rows;
          agentSummaries = agentSummariesRes.rows;

          const sourceId = asText(selected.related_source_id);
          if (sourceId) {
            const { data } = await supabase
              .from('research_sources')
              .select('id,label,canonical_url,status')
              .eq('id', sourceId)
              .maybeSingle();
            relatedSource = (data || null) as Record<string, unknown> | null;
          }
        }

        const detail = selected ? {
          ...commandResponseRow(selected),
          parsed_intent_label: asText((selected.parsed_intent as Record<string, unknown> | undefined)?.target_label || (selected.parsed_intent as Record<string, unknown> | undefined)?.command_type || selected.command_type),
          related_source: relatedSource ? {
            id: asText(relatedSource.id),
            label: asText(relatedSource.label),
            url: asText(relatedSource.canonical_url),
            status: asText(relatedSource.status),
          } : null,
          related_agent_summaries: agentSummaries.map((row) => ({
            id: asText(row.id),
            agent_name: asText(row.agent_name),
            headline: asText(row.headline || row.summary),
            status: asText(row.run_status),
            completed_at: asText(row.created_at),
          })),
          timeline: [
            {
              id: `created:${asText(selected.id)}`,
              label: 'Command captured',
              status: 'created',
              created_at: asText(selected.created_at),
              detail: 'Command persisted in Windows-side admin command store.',
            },
            ...approvals.map((row) => ({
              id: `approval:${asText(row.id)}`,
              label: `Approval ${asText(row.decision)}`,
              status: asText(row.decision),
              created_at: asText(row.approved_at),
              detail: asText(row.reason || 'Approval review recorded.'),
            })),
            {
              id: `execution:${asText(selected.id)}`,
              label: 'Execution status',
              status: asText(selected.execution_outcome || 'pending'),
              created_at: asText(selected.created_at),
              detail: asText(selected.execution_summary || 'No execution summary recorded yet.'),
            },
          ],
        } : null;

        return json(200, {
          ok: true,
          items,
          selected: detail,
          source: 'supabase',
        });
      }
    }

    const proxied = await proxyToOracle({
      path: '/admin/command-inbox',
      method: 'GET',
      query,
      forwardAuth: true,
      event,
    });

    return json(proxied.status, proxied.json || {});
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};