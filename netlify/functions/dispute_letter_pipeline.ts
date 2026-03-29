import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { getUserSupabaseClient } from './_shared/supabase_user_client';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { getBearerToken } from './_shared/staff_auth';
import { resolveTenantId } from './_shared/tenant_resolve';

const ItemSchema = z.object({
  bureau: z.enum(['all', 'experian', 'equifax', 'transunion']).optional().default('all'),
  creditor: z.string().min(1),
  account_reference: z.string().optional(),
  reason: z.string().min(1),
  details: z.string().optional(),
});

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  contact_id: z.string().optional(),
  recipient_name: z.string().min(1),
  recipient_address: z.string().optional(),
  tone: z.enum(['firm', 'neutral']).optional().default('firm'),
  items: z.array(ItemSchema).min(1),
});

type RedactionStats = {
  emails: number;
  phones: number;
  ssn: number;
  long_numbers: number;
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = BodySchema.parse(JSON.parse(event.body || '{}'));
    const userClient = getUserSupabaseClient(event);
    const admin = getAdminSupabaseClient();

    const bearer = getBearerToken(event);
    if (!bearer) return json(401, { error: 'Missing Authorization bearer token' });

    const { data: userRes, error: userError } = await admin.auth.getUser(bearer);
    if (userError || !userRes?.user?.id) return json(401, { error: 'Invalid bearer token' });

    const userId = userRes.user.id;
    const tenantId = body.tenant_id || (await resolveTenantId(userClient));
    if (!tenantId) return json(400, { error: 'Unable to resolve tenant context.' });

    const hasTenantAccess = await userCanAccessTenant(admin, userId, tenantId);
    if (!hasTenantAccess) {
      return json(403, { error: 'Unauthorized for tenant context.' });
    }

    const rawContext = {
      contact_id: body.contact_id || null,
      recipient_name: body.recipient_name,
      recipient_address: body.recipient_address || null,
      tone: body.tone,
      items: body.items,
      generated_at: new Date().toISOString(),
    };

    const redactionStats: RedactionStats = {
      emails: 0,
      phones: 0,
      ssn: 0,
      long_numbers: 0,
    };

    const redactedContext = redactValue(rawContext, redactionStats);
    const contextHash = sha256(stableStringify(rawContext));

    const prompt = buildPrompt(redactedContext);
    const model = 'gemini-3-pro-preview';

    const generatedDraft = await generateDraftWithFallback(prompt, model);
    const mergedLetter = mergeDisputeLetter({
      recipientName: body.recipient_name,
      recipientAddress: body.recipient_address,
      items: body.items,
      generatedDraft,
    });

    const { data: runRow, error: runError } = await admin
      .from('dispute_letter_runs')
      .insert({
        tenant_id: tenantId,
        contact_id: body.contact_id || null,
        requested_by_user_id: userId,
        status: 'completed',
        raw_context_sha256: contextHash,
        redaction_stats: redactionStats,
        redacted_context: redactedContext,
        generation_prompt: prompt,
        generated_draft: generatedDraft,
        merged_letter: mergedLetter,
        model,
      })
      .select('id,created_at,status')
      .single();

    if (runError || !runRow?.id) {
      throw new Error(runError?.message || 'Unable to store dispute letter run');
    }

    const title = `Dispute Letter - ${new Date().toISOString().slice(0, 10)}`;
    const { data: letterRow, error: letterError } = await admin
      .from('dispute_letters')
      .insert({
        run_id: runRow.id,
        tenant_id: tenantId,
        contact_id: body.contact_id || null,
        created_by_user_id: userId,
        title,
        letter_text: mergedLetter,
        output_format: 'text/plain',
        status: 'pending_review',
        metadata: {
          redaction_stats: redactionStats,
          item_count: body.items.length,
          tone: body.tone,
        },
      })
      .select('id,title,status,created_at')
      .single();

    if (letterError || !letterRow?.id) {
      throw new Error(letterError?.message || 'Unable to store dispute letter');
    }

    await admin.from('audit_events').insert({
      tenant_id: tenantId,
      actor_user_id: userId,
      event_type: 'dispute_letter.pipeline_completed',
      metadata: {
        run_id: runRow.id,
        letter_id: letterRow.id,
        redaction_stats: redactionStats,
        model,
      },
    });

    return json(200, {
      success: true,
      run: {
        id: runRow.id,
        status: runRow.status,
        created_at: runRow.created_at,
        redaction_stats: redactionStats,
        model,
      },
      letter: {
        id: letterRow.id,
        title: letterRow.title,
        status: letterRow.status,
        created_at: letterRow.created_at,
        letter_text: mergedLetter,
      },
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

async function userCanAccessTenant(admin: ReturnType<typeof getAdminSupabaseClient>, userId: string, tenantId: string | null): Promise<boolean> {
  if (!tenantId) return false;
  const directMembership = await admin
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .limit(1);

  if (!directMembership.error && (directMembership.data || []).length > 0) return true;

  const fallbackMembership = await admin
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .limit(1);

  if (!fallbackMembership.error && (fallbackMembership.data || []).length > 0) return true;

  const adminMembership = await admin
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'owner', 'super_admin'])
    .limit(1);

  if (!adminMembership.error && (adminMembership.data || []).length > 0) return true;

  const adminFallback = await admin
    .from('tenant_members')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'owner', 'super_admin'])
    .limit(1);

  return !adminFallback.error && (adminFallback.data || []).length > 0;
}

function buildPrompt(redactedContext: unknown) {
  return [
    'You draft educational dispute-letter templates for credit-report inaccuracies.',
    'Output plain text only.',
    'Do not claim guaranteed outcomes.',
    'Do not provide legal advice. Keep language educational and professional.',
    'Include a concise request to investigate and correct unverifiable or inaccurate reporting under FCRA principles.',
    'Use this REDACTED context JSON:',
    JSON.stringify(redactedContext),
  ].join('\n\n');
}

async function generateDraftWithFallback(prompt: string, model: string): Promise<string> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return [
      'I am writing to dispute inaccurate or unverifiable information reported in my credit file.',
      'Please investigate the listed tradelines, verify accuracy with the furnisher, and correct or remove any entries that cannot be fully verified.',
      'I request an updated credit report once the investigation is complete.',
    ].join('\n\n');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    } as any);

    const text = String(response.text || '').trim();
    if (text.length > 0) return text;
  } catch {
    // fall through to deterministic fallback
  }

  return [
    'I am writing to dispute inaccurate or unverifiable information reported in my credit file.',
    'Please investigate the listed tradelines, verify accuracy with the furnisher, and correct or remove any entries that cannot be fully verified.',
    'I request an updated credit report once the investigation is complete.',
  ].join('\n\n');
}

function mergeDisputeLetter(args: {
  recipientName: string;
  recipientAddress?: string;
  items: Array<z.infer<typeof ItemSchema>>;
  generatedDraft: string;
}): string {
  const dateLine = new Date().toLocaleDateString();
  const recipientBlock = [args.recipientName, args.recipientAddress || ''].filter(Boolean).join('\n');

  const itemLines = args.items
    .map((item, index) => {
      const acct = item.account_reference ? ` (Acct: ${item.account_reference})` : '';
      const details = item.details ? ` - ${item.details}` : '';
      return `${index + 1}. ${item.creditor}${acct}: ${item.reason}${details}`;
    })
    .join('\n');

  return [
    dateLine,
    recipientBlock,
    '',
    'Subject: Credit Report Dispute Request',
    '',
    'To Whom It May Concern,',
    '',
    args.generatedDraft.trim(),
    '',
    'Disputed Items:',
    itemLines,
    '',
    'Please provide the results of your investigation and an updated report once processing is complete.',
    '',
    'Sincerely,',
    args.recipientName,
  ].join('\n');
}

function redactValue(value: unknown, stats: RedactionStats): unknown {
  if (typeof value === 'string') return redactText(value, stats);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, stats));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v, stats);
    }
    return out;
  }
  return value;
}

function redactText(input: string, stats: RedactionStats): string {
  let text = String(input || '');

  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, () => {
    stats.emails += 1;
    return '[REDACTED_EMAIL]';
  });

  text = text.replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, () => {
    stats.ssn += 1;
    return '[REDACTED_SSN]';
  });

  text = text.replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/g, () => {
    stats.phones += 1;
    return '[REDACTED_PHONE]';
  });

  text = text.replace(/\b\d{8,19}\b/g, (raw) => {
    stats.long_numbers += 1;
    const tail = raw.slice(-4);
    return `[REDACTED_NUM_${tail}]`;
  });

  return text;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',') + '}';
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
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
