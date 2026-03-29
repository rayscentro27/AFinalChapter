import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireStaffUser } from './_shared/staff_auth';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const BodySchema = z.object({
  agent_name: z.string().min(1),
  prompt_version: z.coerce.number().int().min(1),
  reason: z.string().optional(),
});

const ensureHistory = async (agentId: string, promptVersion: number, systemPrompt: string) => {
  try {
    await supabase.from('agent_prompt_history').insert({
      agent_id: agentId,
      prompt_version: promptVersion,
      system_prompt: systemPrompt,
    });
  } catch {
    // ignore duplicates / missing table errors handled elsewhere
  }
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const actor = await requireStaffUser(event);

    if (!process.env.SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

    const { agent_name, prompt_version } = BodySchema.parse(JSON.parse(event.body || '{}'));

    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('id, name, system_prompt, version')
      .eq('name', agent_name)
      .single();

    if (agentErr || !agent) return json(404, { error: `Agent not found: ${agent_name}` });

    // Make sure current is snapshotted.
    await ensureHistory(agent.id, agent.version ?? 1, String(agent.system_prompt || ''));

    const { data: hist, error: histErr } = await supabase
      .from('agent_prompt_history')
      .select('prompt_version, system_prompt, created_at')
      .eq('agent_id', agent.id)
      .eq('prompt_version', prompt_version)
      .single();

    if (histErr || !hist) {
      const msg = typeof histErr?.message === 'string' ? histErr.message : '';
      if (msg.toLowerCase().includes('agent_prompt_history')) {
        return json(400, { error: 'agent_prompt_history table not found. Create it first.' });
      }
      return json(404, { error: `No history found for ${agent_name} at prompt_version=${prompt_version}` });
    }

    // Rollback creates a NEW version (monotonic).
    const newVersion = (agent.version ?? 1) + 1;
    const targetPrompt = String(hist.system_prompt || '');

    const { error: upErr } = await supabase
      .from('agents')
      .update({
        system_prompt: targetPrompt,
        version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agent.id);

    if (upErr) throw upErr;

    // Snapshot the post-rollback prompt under the new version.
    await ensureHistory(agent.id, newVersion, targetPrompt);

    return json(200, {
      ok: true,
      agent_name: agent.name,
      rolled_back_to_prompt_version: hist.prompt_version,
      new_prompt_version: newVersion,
      rolled_back_created_at: hist.created_at,
    });
   } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    return json(statusCode, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
