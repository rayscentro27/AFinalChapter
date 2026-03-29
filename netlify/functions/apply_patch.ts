import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireStaffUser } from './_shared/staff_auth';
import crypto from "crypto";

const BodySchema = z.object({
  patch_id: z.string().min(10),
  force: z.boolean().optional().default(false),
});


const ensureHistory = async (supabase: any, agentId: string, promptVersion: number, systemPrompt: string) => {
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
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const actor = await requireStaffUser(event);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(500, {
        error: "Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const { patch_id, force } = BodySchema.parse(JSON.parse(event.body || "{}"));

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: patch, error: patchErr } = await supabase
      .from("prompt_patches")
      .select("id, agent_name, patch_text, patch_title, approved")
      .eq("id", patch_id)
      .single();

    if (patchErr || !patch) return json(404, { error: "Patch not found" });

    if (!force && patch.approved === false) return json(409, { error: 'Patch not approved' });

    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, system_prompt, version")
      .eq("name", patch.agent_name)
      .single();

    if (agentErr || !agent) return json(404, { error: "Agent not found" });

    await ensureHistory(supabase, agent.id, agent.version ?? 1, String(agent.system_prompt || ''));

    const patchHash = sha256(`${patch.agent_name}||${patch.patch_title || ''}||${patch.patch_text || ''}`);

    // Dedupe: skip if same patch hash already applied.
    if (String(agent.system_prompt || '').includes(`PATCH_HASH: ${patchHash}`)) {
      return json(200, { ok: true, agent: patch.agent_name, version: agent.version ?? 1, skipped: true, reason: 'Already applied (hash match)' });
    }

    const header = '---- TRAINING PATCH ----';
    const footer = '---- END PATCH ----';

    const block =
      `\n\n${header}\n` +
      `PATCH_TITLE: ${patch.patch_title || 'Patch'}\n` +
      `PATCH_HASH: ${patchHash}\n` +
      String(patch.patch_text || '').trim() +
      `\n${footer}\n`;

    const newPrompt = String(agent.system_prompt || '').trim() + block;

    const { error: upErr } = await supabase
      .from("agents")
      .update({
        system_prompt: newPrompt,
        version: (agent.version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agent.id);

    if (upErr) throw upErr;

    const newVersion = (agent.version ?? 1) + 1;
    await ensureHistory(supabase, agent.id, newVersion, newPrompt);

    // Best-effort bookkeeping
    try {
      await supabase.from('prompt_patches').update({ applied_at: new Date().toISOString(), applied_agent_version: newVersion, apply_error: null }).eq('id', patch.id);
    } catch {
      // ignore
    }

    return json(200, { ok: true, agent: patch.agent_name, version: newVersion });
   } catch (e: any) {
    const statusCode = Number(e?.statusCode) || 400;
    const msg = typeof e?.message === 'string' ? e.message : 'Bad Request';
    return json(statusCode, { error: msg });
  }
};

function sha256(input: string) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
