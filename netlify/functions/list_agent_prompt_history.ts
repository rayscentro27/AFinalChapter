import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const QuerySchema = z.object({
  agent_name: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(30),
  full: z.coerce.boolean().optional().default(false),
});

function snippet(text: string, n = 600) {
  const t = (text || '').toString();
  return t.length <= n ? t : t.slice(0, n) + '...';
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    if (!process.env.SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

    const qs = event.queryStringParameters || {};
    const { agent_name, limit, full } = QuerySchema.parse(qs);

    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('id, name, version')
      .eq('name', agent_name)
      .single();

    if (agentErr || !agent) return json(404, { error: `Agent not found: ${agent_name}` });

    const { data: rows, error: histErr } = await supabase
      .from('agent_prompt_history')
      .select('prompt_version, system_prompt, created_at')
      .eq('agent_id', agent.id)
      .order('prompt_version', { ascending: false })
      .limit(limit);

    if (histErr) {
      const msg = typeof histErr?.message === 'string' ? histErr.message : '';
      if (msg.toLowerCase().includes('agent_prompt_history')) {
        return json(400, { error: 'agent_prompt_history table not found. Create it first.' });
      }
      throw histErr;
    }

    return json(200, {
      ok: true,
      agent_name: agent.name,
      current_prompt_version: agent.version ?? 1,
      versions: (rows || []).map((r: any) => {
        const prompt = String(r.system_prompt || '');
        return {
          prompt_version: r.prompt_version,
          created_at: r.created_at,
          length_chars: prompt.length,
          preview: full ? prompt : snippet(prompt, 600),
        };
      }),
      is_full: full,
    });
  } catch (e: any) {
    return json(400, { error: e?.message || 'Bad Request' });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
