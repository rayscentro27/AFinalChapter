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
};

type RoutingRecommendation = {
  recommended_queue: 'support_admin' | 'underwriting' | 'sales_intake' | 'general_support';
  confidence: number;
  reason: string;
  next_action: string;
  priority: 'normal' | 'high' | 'urgent';
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
      .select('id, tenant_id, subject, status, tags, internal_notes')
      .eq('tenant_id', tenantId)
      .eq('id', body.conversation_id)
      .single();

    if (convoErr || !convo) throw statusError(404, 'conversation_not_found');

    const { data: rows, error: msgErr } = await admin
      .from('messages')
      .select('direction, sender_role, body')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', body.conversation_id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (msgErr) throw new Error(msgErr.message || 'messages_query_failed');

    const transcript = formatTranscript((rows || []) as MessageRow[]);
    const model = routeModel({ taskType: 'ops_routing_recommendation', riskClass: 'medium' });

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: buildPrompt(String((convo as any)?.subject || ''), transcript) }] }],
      config: { temperature: 0.2 } as any,
    } as any);

    const rawText = String((response as any)?.text || '').trim();
    const recommendation = parseRecommendation(rawText, transcript);

    if (body.persist) {
      const existingNotes = Array.isArray((convo as any)?.internal_notes) ? (convo as any).internal_notes : [];
      const nextNotes = [
        {
          type: 'routing_recommendation',
          created_at: new Date().toISOString(),
          actor_user_id: actor.userId,
          source: 'ai',
          recommendation,
        },
        ...existingNotes,
      ].slice(0, 50);

      const { error: updateError } = await admin
        .from('conversations')
        .update({ internal_notes: nextNotes })
        .eq('tenant_id', tenantId)
        .eq('id', body.conversation_id);

      if (updateError) throw new Error(updateError.message || 'routing_note_update_failed');
    }

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      conversation_id: body.conversation_id,
      model,
      recommendation,
      persisted: body.persist,
      automatic_routing_applied: false,
      requires_human_review: true,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { ok: false, error: e?.message || 'bad_request' });
  }
};

function buildPrompt(subject: string, transcript: string) {
  return [
    'Classify this thread for internal staff routing recommendation.',
    'Return strict JSON only:',
    '{"recommended_queue":"support_admin|underwriting|sales_intake|general_support","confidence":0-100,"reason":"...","next_action":"...","priority":"normal|high|urgent"}',
    'Rules:',
    '- recommendation only, do not auto-route',
    '- concise reason and concrete next_action',
    '- no legal or financial guarantees',
    '',
    `Subject: ${subject || '(none)'}`,
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

function parseRecommendation(raw: string, transcript: string): RoutingRecommendation {
  const candidate = extractJsonCandidate(raw);

  if (candidate) {
    try {
      const parsed = JSON.parse(candidate) as any;
      const queue = normalizeQueue(parsed?.recommended_queue);
      const confidence = clampNumber(parsed?.confidence, 0, 100, 65);
      const reason = String(parsed?.reason || '').trim() || 'AI recommendation parsed without explicit reason.';
      const next_action = String(parsed?.next_action || '').trim() || 'Review thread and assign manually.';
      const priority = normalizePriority(parsed?.priority);

      return { recommended_queue: queue, confidence, reason, next_action, priority };
    } catch {
      // fallback below
    }
  }

  return heuristicFallback(transcript);
}

function heuristicFallback(transcript: string): RoutingRecommendation {
  const lower = String(transcript || '').toLowerCase();

  if (/funding|underwrite|bank statement|tax return|credit report|eligibility/.test(lower)) {
    return {
      recommended_queue: 'underwriting',
      confidence: 60,
      reason: 'Detected financing and underwriting-related terms in recent messages.',
      next_action: 'Request/verify required underwriting documents and move to underwriting queue review.',
      priority: /urgent|asap|immediately/.test(lower) ? 'high' : 'normal',
    };
  }

  if (/quote|pricing|offer|application|apply|new lead|lead/.test(lower)) {
    return {
      recommended_queue: 'sales_intake',
      confidence: 58,
      reason: 'Detected intake and offer qualification language in the thread.',
      next_action: 'Confirm intake details and assign to sales/intake owner for next-step outreach.',
      priority: 'normal',
    };
  }

  return {
    recommended_queue: 'support_admin',
    confidence: 52,
    reason: 'Default support/admin queue selected due to non-specialized issue signals.',
    next_action: 'Have support review the latest client message and respond with next steps.',
    priority: /urgent|asap|immediately/.test(lower) ? 'high' : 'normal',
  };
}

function normalizeQueue(value: any): RoutingRecommendation['recommended_queue'] {
  const v = String(value || '').toLowerCase();
  if (v === 'underwriting') return 'underwriting';
  if (v === 'sales_intake') return 'sales_intake';
  if (v === 'general_support') return 'general_support';
  return 'support_admin';
}

function normalizePriority(value: any): RoutingRecommendation['priority'] {
  const v = String(value || '').toLowerCase();
  if (v === 'urgent') return 'urgent';
  if (v === 'high') return 'high';
  return 'normal';
}

function clampNumber(value: any, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
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
