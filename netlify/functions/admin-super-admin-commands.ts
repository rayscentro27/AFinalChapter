import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { commandResponseRow, inferCommandTarget, inferCommandType, safeRows } from './_shared/admin_local_state';
import { proxyToOracle } from './_shared/oracle_proxy';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { requireStaffUser } from './_shared/staff_auth';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().min(1).optional(),
});

const BodySchema = z.object({
  command: z.string().min(3),
});

const ActionSchema = z.object({
  command_id: z.string().min(1),
  action: z.enum(['request_approval']),
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
          return json(200, { ok: true, items, count: items.length, source: 'supabase' });
        }
      }

      const proxied = await proxyToOracle({
        path: '/admin/super-admin/commands',
        method: 'GET',
        query,
        forwardAuth: true,
        event,
      });
      return json(proxied.status, proxied.json || {});
    }

    if (event.httpMethod === 'POST') {
      const auth = await requireStaffUser(event);
      const body = BodySchema.parse(JSON.parse(event.body || '{}'));
      const supabase = getAdminSupabaseClient();
      const commandType = inferCommandType(body.command);
      const targetLabel = inferCommandTarget(body.command);
      const parsedIntent = {
        command_type: commandType,
        target_label: targetLabel,
        validation_status: 'needs_review',
        confidence_label: 'heuristic',
        notes: ['Stored locally on Windows-side control plane.', 'Execution remains review-gated until backend handoff is explicit.'],
      };

      const { data, error } = await supabase
        .from('admin_commands')
        .insert({
          issuer_user_id: auth.userId,
          command_text: body.command.trim(),
          command_type: commandType,
          target_scope: 'global',
          parsed_intent: parsedIntent,
          validation_status: 'needs_review',
          approval_required: true,
          approval_status: 'pending',
          queue_handoff_state: 'not_queued',
          execution_outcome: 'pending',
          execution_summary: 'Command captured locally and awaiting operator approval or downstream execution routing.',
          metadata: { source: 'windows_admin_command_center', target_label: targetLabel },
        })
        .select('id,command_text,command_type,validation_status,parsed_intent,approval_required,approval_status,queue_handoff_state,execution_outcome,execution_summary,related_source_id,created_at')
        .single();

      if (error) throw new Error(error.message);

      return json(200, {
        ok: true,
        submitted: commandResponseRow((data || {}) as Record<string, unknown>),
        source: 'supabase',
      });
    }

    if (event.httpMethod === 'PATCH') {
      const auth = await requireStaffUser(event);
      const body = ActionSchema.parse(JSON.parse(event.body || '{}'));
      const supabase = getAdminSupabaseClient();
      const { data: command, error: readError } = await supabase
        .from('admin_commands')
        .select('id,approval_status,approval_required')
        .eq('id', body.command_id)
        .maybeSingle();

      if (readError) throw new Error(readError.message);
      if (!command) throw new Error('Command not found');

      const { error: updateError } = await supabase
        .from('admin_commands')
        .update({
          approval_required: true,
          approval_status: 'pending',
          validation_status: 'needs_review',
          execution_summary: 'Approval requested from command center.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.command_id);

      if (updateError) throw new Error(updateError.message);

      const { error: auditError } = await supabase
        .from('control_plane_audit_log')
        .insert({
          actor_user_id: auth.userId,
          actor_role: auth.roles[0] || 'admin',
          action: 'admin_command.request_approval',
          target_type: 'admin_command',
          target_id: body.command_id,
          before_state: command,
          after_state: { approval_status: 'pending' },
          reason: 'Approval requested from Windows admin command center.',
          metadata: { source: 'windows_admin_command_center' },
        });

      if (auditError) throw new Error(auditError.message);

      return json(200, { ok: true, command_id: body.command_id, approval_status: 'pending', source: 'supabase' });
    }

    return json(405, { ok: false, error: 'method_not_allowed' });
  } catch (error: any) {
    return json(Number(error?.statusCode) || 400, { ok: false, error: String(error?.message || 'bad_request') });
  }
};