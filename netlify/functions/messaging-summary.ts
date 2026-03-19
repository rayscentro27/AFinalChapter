import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { requireStaffUser } from './_shared/staff_auth';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { routeModel } from './_shared/model_router';

const STAFF_ROLES = new Set(['owner', 'super_admin', 'admin', 'supervisor', 'agent', 'sales', 'salesperson']);

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid(),
  persist: z.boolean().optional().default(true),
});

type MessageRow = {
  direction?: 'in' | 'out' | null;
  sender_role?: string | null;
  body?: string | null;
  created_at?: string | null;
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    const actor = await requireStaffUser(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const apiKey = String(process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
    if (!apiKey) throw statusError(500, 'Missing GEMINI_API_KEY');

    const admin = getAdminSupabaseClient();
    const tenantId = await resolveStaffTenant(admin, actor.userId, body.tenant_id || null);

    const { data: convo, error: convoErr } = await admin
      .from('conversations')
      .select('id, tenant_id, subject, status, summary_text')
      .eq('tenant_id', tenantId)
      .eq('id', body.conversation_id)
      .single();

    if (convoErr || !convo) throw statusError(404, 'conversation_not_found');

    const { data: rows, error: msgErr } = await admin
      .from('messages')
      .select('direction, sender_role, body, created_at')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', body.conversation_id)
      .order('created_at', { ascending: false })
      .limit(40);

    if (msgErr) throw new Error(msgErr.message || 'messages_query_failed');

    const transcript = formatTranscript((rows || []) as MessageRow[]);

    const model = routeModel({
      taskType: 'thread_summary',
      riskClass: 'medium',
    });

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: buildPrompt(String((convo as any)?.subject || ''), transcript) }] }],
      config: {
        temperature: 0.2,
      } as any,
    } as any);

    const rawText = String((response as any)?.text || '').trim();
    const summary = parseSummary(rawText);

    if (body.persist) {
      const { error: updateError } = await admin
        .from('conversations')
        .update({
          summary_text: summary,
          summary_updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('id', body.conversation_id);

      if (updateError) throw new Error(updateError.message || 'summary_update_failed');
    }

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      conversation_id: body.conversation_id,
      model,
      summary,
      persisted: body.persist,
      requires_human_review: true,
      auto_send: false,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { ok: false, error: e?.message || 'bad_request' });
  }
};

function buildPrompt(subject: string, transcript: string) {
  return [
    'Create a concise staff-facing conversation summary.',
    'Return strict JSON with this shape:',
    '{"issue":"...","current_status":"...","requested_actions":"...","next_step":"..."}',
    'Constraints:',
    '- no legal or financial guarantees',
    '- concise and objective',
    '- include concrete next action',
    '',
    `Thread subject: ${subject || '(none)'}`,
    '',
    'Transcript:',
    transcript || '(no messages)',
  ].join('\n');
}

function formatTranscript(rows: MessageRow[]) {
  const normalized = [...rows].reverse();
  return normalized
    .map((row) => {
      const direction = String(row.direction || '').toLowerCase();
      const role = String(row.sender_role || '').toLowerCase();
      const who = direction === 'in' || role === 'client' ? 'Client' : 'Staff';
      const body = String(row.body || '').trim().replace(/\s+/g, ' ');
      if (!body) return null;
      return `${who}: ${body}`;
    })
    .filter(Boolean)
    .join('\n');
}

function parseSummary(raw: string): string {
  const candidate = extractJsonCandidate(raw);

  if (candidate) {
    try {
      const parsed = JSON.parse(candidate) as any;
      const issue = String(parsed?.issue || '').trim();
      const status = String(parsed?.current_status || '').trim();
      const actions = String(parsed?.requested_actions || '').trim();
      const nextStep = String(parsed?.next_step || '').trim();

      const lines = [
        issue ? `Issue: ${issue}` : null,
        status ? `Current Status: ${status}` : null,
        actions ? `Requested Actions: ${actions}` : null,
        nextStep ? `Next Step: ${nextStep}` : null,
      ].filter(Boolean);

      if (lines.length) return lines.join('\n');
    } catch {
      // fallback below
    }
  }

  const compact = String(raw || '').replace(/\s+/g, ' ').trim();
  if (compact) return compact.slice(0, 1200);

  return 'Issue: Client thread summary unavailable.\nCurrent Status: Needs staff review.\nNext Step: Review latest messages and reply.';
}

function extractJsonCandidate(raw: string): string | null {
  const codeBlock = raw.match(/```json\s*([\s\S]*?)```/i);
  if (codeBlock?.[1]) return codeBlock[1].trim();

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) return raw.slice(firstBrace, lastBrace + 1).trim();
  return null;
}

async function resolveStaffTenant(admin: any, userId: string, requestedTenantId: string | null): Promise<string> {
  const { data, error } = await admin
    .from('tenant_memberships')
    .select('tenant_id, role')
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to resolve memberships: ${error.message}`);

  const rows = (data || []) as Array<{ tenant_id: string; role: string | null }>;
  const allowedTenantIds = Array.from(
    new Set(
      rows
        .filter((row) => STAFF_ROLES.has(String(row.role || '').toLowerCase()))
        .map((row) => String(row.tenant_id || ''))
        .filter(Boolean)
    )
  );

  if (!allowedTenantIds.length) throw statusError(403, 'staff_tenant_membership_required');

  if (requestedTenantId) {
    if (!allowedTenantIds.includes(requestedTenantId)) throw statusError(403, 'requested_tenant_not_accessible');
    return requestedTenantId;
  }

  if (allowedTenantIds.length > 1) throw statusError(400, 'multiple_tenants_provide_tenant_id');

  return allowedTenantIds[0];
}

function statusError(statusCode: number, message: string) {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
}

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
