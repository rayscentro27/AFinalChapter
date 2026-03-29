import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireStaffUser } from './_shared/staff_auth';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const boolFromQuery = (v: unknown, fallback = false) => {
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return fallback;
};

const QuerySchema = z.object({
  agent_name: z.string().min(1),
  prompt_version: z.coerce.number().int().min(1),
  // if true, return full prompt text (careful: can be large)
  full: z.any().optional(),
});

const ensureHistory = async (agentId: string, promptVersion: number, systemPrompt: string) => {
  try {
    await supabase.from('agent_prompt_history').insert({
      agent_id: agentId,
      prompt_version: promptVersion,
      system_prompt: systemPrompt,
    });
  } catch {
    // ignore
  }
};

function snippet(text: string, n = 600) {
  const t = (text || '').toString();
  return t.length <= n ? t : t.slice(0, n) + '...';
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    const actor = await requireStaffUser(event);

    if (!process.env.SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

    const qs = event.queryStringParameters || {};
    const parsed = QuerySchema.parse(qs);
    const full = boolFromQuery(parsed.full, false);

    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('id, name, version, system_prompt')
      .eq('name', parsed.agent_name)
      .single();

    if (agentErr || !agent) return json(404, { error: `Agent not found: ${parsed.agent_name}` });

    // Best-effort bootstrap of current version.
    await ensureHistory(agent.id, agent.version ?? 1, String(agent.system_prompt || ''));

    const { data: hist, error: histErr } = await supabase
      .from('agent_prompt_history')
      .select('prompt_version, system_prompt, created_at')
      .eq('agent_id', agent.id)
      .eq('prompt_version', parsed.prompt_version)
      .single();

    if (histErr || !hist) {
      const msg = typeof histErr?.message === 'string' ? histErr.message : '';
      if (msg.toLowerCase().includes('agent_prompt_history')) {
        return json(400, { error: 'agent_prompt_history table not found. Create it first.' });
      }
      return json(404, {
        error: `No history found for ${parsed.agent_name} at prompt_version=${parsed.prompt_version}`,
      });
    }

    const systemPrompt = String(hist.system_prompt || '');

    return json(200, {
      ok: true,
      agent_name: agent.name,
      current_prompt_version: agent.version ?? 1,
      requested_prompt_version: hist.prompt_version,
      created_at: hist.created_at,
      length_chars: systemPrompt.length,
      preview: full ? systemPrompt : snippet(systemPrompt, 900),
      is_full: full,
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
