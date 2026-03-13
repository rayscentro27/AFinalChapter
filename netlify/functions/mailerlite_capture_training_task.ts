import type { Handler } from '@netlify/functions';
import crypto from 'crypto';
import { z } from 'zod';
import { getAdminSupabaseClient } from './_shared/supabase_admin_client';
import { requireStaffUser } from './_shared/staff_auth';

const TaskTypeSchema = z.enum(['upload', 'action', 'education', 'review', 'meeting', 'legal']);
const SignalSchema = z.enum(['red', 'yellow', 'green']);

const BodySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  training_title: z.string().min(3).max(180),
  additional_info: z.string().min(8),
  source_url: z.string().optional(),
  tags: z.array(z.string().min(1)).optional().default([]),
  employee_targets: z.array(z.string().min(1)).optional().default([]),
  auto_apply_patches: z.boolean().optional().default(true),
  create_task: z.boolean().optional().default(true),
  task: z
    .object({
      title: z.string().min(3).max(180).optional(),
      description: z.string().max(4000).optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      assigned_employee: z.string().min(1).optional(),
      signal: SignalSchema.optional().default('yellow'),
      type: TaskTypeSchema.optional().default('education'),
    })
    .optional(),
  sync_summary: z
    .object({
      total: z.number().int().min(0),
      successful: z.number().int().min(0),
      failed: z.number().int().min(0).optional().default(0),
      error: z.string().optional(),
    })
    .optional(),
});

type PatchIn = {
  agent_name: string;
  patch_title: string;
  patch_text: string;
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const { userId } = await requireStaffUser(event);
    const body = BodySchema.parse(JSON.parse(event.body || '{}'));

    const supabase = getAdminSupabaseClient();

    const tenantId = body.create_task ? await resolveTenantForUser(supabase, userId, body.tenant_id) : null;

    const targets = uniqueStrings(body.employee_targets);
    const nowIso = new Date().toISOString();
    const sourceUrl = (body.source_url || '').trim() || `mailerlite://sync/${Date.now()}-${randId(6)}`;
    const content = buildTrainingContent(body.additional_info, body.sync_summary);

    const tags = uniqueStrings(['mailerlite', 'ai-training', 'operations', ...body.tags]);

    const { data: doc, error: docErr } = await supabase
      .from('knowledge_docs')
      .insert({
        source_url: sourceUrl,
        source_type: 'mailerlite',
        source_platform: 'mailerlite',
        title: body.training_title,
        content,
        tags,
      })
      .select('id')
      .single();

    if (docErr || !doc?.id) throw new Error(`Failed to create knowledge doc: ${docErr?.message || 'unknown'}`);

    const rules = extractRules(body.additional_info);
    const checklist = [
      'Review MailerLite sync failures and correct invalid subscriber records.',
      'Update outbound messaging according to the new training directives.',
      'Run scenario validation for targeted AI employees after patch apply.',
    ];

    const playbookSlug = `mailerlite-${Date.now()}-${randId(5)}`;

    const { data: playbook, error: pbErr } = await supabase
      .from('playbooks')
      .insert({
        doc_id: doc.id,
        title: `${body.training_title} Playbook`,
        summary: summarize(body.additional_info),
        rules,
        checklist,
        templates: {
          source: 'mailerlite_sync_training',
          generated_at: nowIso,
          sync_summary: body.sync_summary || null,
        },
        slug: playbookSlug,
      })
      .select('id')
      .single();

    if (pbErr) throw new Error(`Failed to create playbook: ${pbErr.message}`);

    const patchTitle = `${body.training_title} :: MailerLite protocol`;
    const patchText = buildPatchText(body.additional_info, body.sync_summary);

    const patches: PatchIn[] = targets.map((agentName) => ({
      agent_name: agentName,
      patch_title: patchTitle,
      patch_text: patchText,
    }));

    if (patches.length > 0) {
      const { error: patchErr } = await supabase.from('prompt_patches').insert(
        patches.map((p) => ({
          doc_id: doc.id,
          agent_name: p.agent_name,
          patch_title: p.patch_title,
          patch_text: p.patch_text,
        }))
      );
      if (patchErr) throw new Error(`Failed to create prompt patches: ${patchErr.message}`);
    }

    const applyResults = body.auto_apply_patches
      ? await applyPatchesToAgents(supabase as any, patches)
      : { applied: [], skipped: [], failed: [] };

    let taskId: string | null = null;
    if (body.create_task) {
      if (!tenantId) throw new Error('Unable to resolve tenant_id for task creation');

      taskId = `ml-train-${Date.now().toString(36)}-${randId(4)}`;
      const dueDate = body.task?.due_date || isoDatePlusDays(2);
      const taskTitle =
        body.task?.title ||
        'Review MailerLite sync outcomes and apply AI training updates';
      const taskDescription =
        body.task?.description ||
        `Use playbook ${playbookSlug} and knowledge doc ${doc.id} to execute updated outreach protocol.`;

      const { error: taskErr } = await supabase.from('client_tasks').insert({
        tenant_id: tenantId,
        task_id: taskId,
        title: taskTitle,
        description: taskDescription,
        status: 'pending',
        due_date: dueDate,
        type: body.task?.type || 'education',
        signal: body.task?.signal || 'yellow',
        assigned_employee: body.task?.assigned_employee || targets[0] || null,
        group_key: 'marketing_followup',
        template_key: null,
        meta: {
          source: 'mailerlite_sync_training',
          knowledge_doc_id: doc.id,
          playbook_id: playbook?.id || null,
          targeted_employees: targets,
          sync_summary: body.sync_summary || null,
        },
      });

      if (taskErr) throw new Error(`Failed to create task: ${taskErr.message}`);
    }

    return json(200, {
      ok: true,
      tenant_id: tenantId,
      knowledge_doc_id: doc.id,
      playbook_id: playbook?.id || null,
      task_id: taskId,
      patches_inserted: patches.length,
      patches_applied: applyResults.applied.length,
      patches_skipped: applyResults.skipped.length,
      patches_failed: applyResults.failed.length,
      applied: applyResults.applied,
      skipped: applyResults.skipped,
      failed: applyResults.failed,
    });
  } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))
  );
}

function randId(length: number) {
  return crypto.randomBytes(Math.max(4, length)).toString('hex').slice(0, length);
}

function summarize(text: string, max = 280) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3)}...`;
}

function extractRules(info: string): string[] {
  const lines = String(info || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const bullets = lines
    .map((l) => l.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter((l) => l.length > 0);

  if (bullets.length === 0) return [summarize(info, 180)];
  return bullets.slice(0, 12);
}

function buildTrainingContent(additionalInfo: string, syncSummary?: { total: number; successful: number; failed: number; error?: string }) {
  const summaryBlock = syncSummary
    ? [
        `MailerLite Sync Summary:`,
        `- Total contacts: ${syncSummary.total}`,
        `- Successful: ${syncSummary.successful}`,
        `- Failed: ${syncSummary.failed || 0}`,
        syncSummary.error ? `- Error: ${syncSummary.error}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : 'MailerLite Sync Summary: not provided.';

  return `${summaryBlock}\n\nAdditional Training Instructions:\n${additionalInfo.trim()}`;
}

function buildPatchText(additionalInfo: string, syncSummary?: { total: number; successful: number; failed: number; error?: string }) {
  const syncLine = syncSummary
    ? `Current sync baseline: total=${syncSummary.total}, successful=${syncSummary.successful}, failed=${syncSummary.failed || 0}.`
    : 'Current sync baseline was not provided.';

  return [
    'Incorporate the following MailerLite operations updates into planning, follow-up, and messaging decisions.',
    syncLine,
    'Prioritize reliability, compliance language, and measurable follow-up outcomes.',
    '',
    additionalInfo.trim(),
  ].join('\n');
}

function isoDatePlusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function resolveTenantForUser(
  supabase: ReturnType<typeof getAdminSupabaseClient>,
  userId: string,
  requestedTenantId?: string
): Promise<string> {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to resolve tenant membership: ${error.message}`);

  const memberships = Array.from(
    new Set((data || []).map((r: any) => String(r.tenant_id)).filter(Boolean))
  );

  if (requestedTenantId) {
    if (!memberships.includes(requestedTenantId)) {
      const err: any = new Error('Requested tenant_id is not accessible by current staff user');
      err.statusCode = 403;
      throw err;
    }
    return requestedTenantId;
  }

  if (memberships.length === 1) return memberships[0];
  if (memberships.length === 0) {
    const err: any = new Error('No tenant membership found for current staff user');
    err.statusCode = 403;
    throw err;
  }

  const err: any = new Error('Multiple tenants found; provide tenant_id to create task');
  err.statusCode = 400;
  throw err;
}

async function ensureHistory(supabase: ReturnType<typeof getAdminSupabaseClient>, agentId: string, promptVersion: number, systemPrompt: string) {
  try {
    await supabase.from('agent_prompt_history').insert({
      agent_id: agentId,
      prompt_version: promptVersion,
      system_prompt: systemPrompt,
    });
  } catch {
    // ignore history insert failures
  }
}

async function applyPatchesToAgents(supabase: ReturnType<typeof getAdminSupabaseClient>, patches: PatchIn[]) {
  const applied: Array<{ agent_name: string; patch_title: string; new_version: number }> = [];
  const skipped: Array<{ agent_name: string; patch_title: string; reason: string }> = [];
  const failed: Array<{ agent_name: string; patch_title: string; error: string }> = [];

  if (!patches?.length) return { applied, skipped, failed };

  const byAgent = new Map<string, Array<{ patch_title: string; patch_text: string }>>();
  for (const p of patches) {
    if (!byAgent.has(p.agent_name)) byAgent.set(p.agent_name, []);
    byAgent.get(p.agent_name)!.push({ patch_title: p.patch_title, patch_text: p.patch_text });
  }

  for (const [agent_name, agentPatches] of byAgent.entries()) {
    try {
      const { data: agent, error: agentErr } = await supabase
        .from('agents')
        .select('id, name, system_prompt, version')
        .eq('name', agent_name)
        .single();

      if (agentErr || !agent) throw new Error(`Agent not found: ${agent_name}`);

      const currentPrompt = String(agent.system_prompt || '').trim();
      await ensureHistory(supabase, agent.id, agent.version ?? 1, currentPrompt);

      const blocksToAppend: Array<{ patch_title: string; block: string }> = [];

      for (const p of agentPatches) {
        const patchHash = crypto
          .createHash('sha256')
          .update(`${agent_name}||${p.patch_title}||${p.patch_text}`, 'utf8')
          .digest('hex');

        if (currentPrompt.includes(`PATCH_HASH: ${patchHash}`)) {
          skipped.push({ agent_name, patch_title: p.patch_title, reason: 'Already applied (hash match)' });
          continue;
        }

        const block =
          '\n\n---- TRAINING PATCH ----\n' +
          `PATCH_TITLE: ${p.patch_title}\n` +
          `PATCH_HASH: ${patchHash}\n` +
          String(p.patch_text || '').trim() +
          '\n---- END PATCH ----\n';

        blocksToAppend.push({ patch_title: p.patch_title, block });
      }

      if (blocksToAppend.length === 0) continue;

      const newPrompt = currentPrompt + blocksToAppend.map((b) => b.block).join('');
      const newVersion = (agent.version ?? 1) + 1;

      const { error: upErr } = await supabase
        .from('agents')
        .update({
          system_prompt: newPrompt,
          version: newVersion,
          updated_at: new Date().toISOString(),
        })
        .eq('id', agent.id);

      if (upErr) throw upErr;

      await ensureHistory(supabase, agent.id, newVersion, newPrompt);

      for (const b of blocksToAppend) {
        applied.push({ agent_name, patch_title: b.patch_title, new_version: newVersion });
      }
    } catch (err: any) {
      for (const p of agentPatches) {
        failed.push({
          agent_name,
          patch_title: p.patch_title,
          error: typeof err?.message === 'string' ? err.message : 'Unknown error',
        });
      }
    }
  }

  return { applied, skipped, failed };
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
