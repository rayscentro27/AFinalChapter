import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const BodySchema = z.object({
  agent_name: z.string().min(1),
  // If true, don't write; just return the would-be consolidated prompt.
  dry_run: z.coerce.boolean().optional().default(false),
});

type ExtractedPatch = { title: string; hash?: string; text: string };

const END_MARK = '---- END PATCH ----';

function extractPatches(prompt: string): { base: string; patches: ExtractedPatch[] } {
  const patches: ExtractedPatch[] = [];
  let out = '';
  let i = 0;

  while (true) {
    const start = prompt.indexOf('---- TRAINING PATCH', i);
    if (start === -1) break;

    out += prompt.slice(i, start);

    const end = prompt.indexOf(END_MARK, start);
    if (end === -1) {
      // Unclosed block; keep remainder in base.
      out += prompt.slice(start);
      i = prompt.length;
      break;
    }

    const block = prompt.slice(start, end + END_MARK.length);

    // Try to parse title/hash from block.
    let title = '';
    let hash: string | undefined;

    const mTitle = block.match(/\bPATCH_TITLE:\s*(.+)\n/);
    if (mTitle) title = String(mTitle[1] || '').trim();

    const mHash = block.match(/\bPATCH_HASH:\s*([a-f0-9]{16,64})/i);
    if (mHash) hash = String(mHash[1] || '').trim();

    if (!title) {
      const mHeader = block.match(/---- TRAINING PATCH:\s*(.+?)\s*\(/);
      if (mHeader) title = String(mHeader[1] || '').trim();
    }

    // Extract the body between the first newline after header and END.
    const firstNl = block.indexOf('\n');
    const body = firstNl === -1 ? '' : block.slice(firstNl + 1, block.length - END_MARK.length);

    patches.push({ title: title || 'Patch', hash, text: body.trim() });

    i = end + END_MARK.length;
  }

  out += prompt.slice(i);

  return { base: out.trim(), patches };
}

function dedupePatches(patches: ExtractedPatch[]): ExtractedPatch[] {
  const out: ExtractedPatch[] = [];
  const seen = new Set<string>();
  for (const p of patches) {
    const k = p.hash ? `h:${p.hash}` : `t:${p.title}::${p.text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

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

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    if (!process.env.SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

    const { agent_name, dry_run } = BodySchema.parse(JSON.parse(event.body || '{}'));

    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('id, name, system_prompt, version, base_prompt')
      .eq('name', agent_name)
      .single();

    if (agentErr || !agent) return json(404, { error: `Agent not found: ${agent_name}` });

    const currentPrompt = String(agent.system_prompt || '');
    const extracted = extractPatches(currentPrompt);
    const patches = dedupePatches(extracted.patches);

    // If a base_prompt exists, prefer it as baseline; otherwise use extracted base.
    const base = String(agent.base_prompt || '').trim() || extracted.base;

    const consolidatedSection =
      patches.length === 0
        ? ''
        :
            '\n\n# CONSOLIDATED TRAINING PATCHES\n' +
            patches
              .map((p) => {
                const meta = p.hash ? ` (hash ${p.hash})` : '';
                return `\n## ${p.title}${meta}\n${p.text.trim()}\n`;
              })
              .join('');

    const consolidatedPrompt = (base.trim() + consolidatedSection).trim() + '\n';

    if (dry_run) {
      return json(200, {
        ok: true,
        dry_run: true,
        agent_name: agent.name,
        current_prompt_version: agent.version ?? 1,
        base_length_chars: base.length,
        patches_found: patches.length,
        consolidated_length_chars: consolidatedPrompt.length,
        consolidated_preview: consolidatedPrompt.slice(0, 1200),
      });
    }

    // Snapshot current.
    await ensureHistory(agent.id, agent.version ?? 1, currentPrompt);

    const newVersion = (agent.version ?? 1) + 1;

    const { error: upErr } = await supabase
      .from('agents')
      .update({
        base_prompt: base,
        consolidated_at: new Date().toISOString(),
        system_prompt: consolidatedPrompt,
        version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agent.id);

    if (upErr) throw upErr;

    await ensureHistory(agent.id, newVersion, consolidatedPrompt);

    return json(200, {
      ok: true,
      agent_name: agent.name,
      previous_prompt_version: agent.version ?? 1,
      new_prompt_version: newVersion,
      patches_consolidated: patches.length,
      consolidated_length_chars: consolidatedPrompt.length,
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
