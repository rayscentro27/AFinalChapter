import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const BodySchema = z.object({
  patch_id: z.string().min(10),
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(500, {
        error: "Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const { patch_id } = BodySchema.parse(JSON.parse(event.body || "{}"));

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: patch, error: patchErr } = await supabase
      .from("prompt_patches")
      .select("id, agent_name, patch_text, patch_title")
      .eq("id", patch_id)
      .single();

    if (patchErr || !patch) return json(404, { error: "Patch not found" });

    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, system_prompt, version")
      .eq("name", patch.agent_name)
      .single();

    if (agentErr || !agent) return json(404, { error: "Agent not found" });

    const header = `---- TRAINING PATCH: ${patch.patch_title || "Patch"} (${patch.id}) ----`;
    const footer = "---- END PATCH ----";

    const newPrompt =
      String(agent.system_prompt || "").trim() +
      "\n\n" +
      header +
      "\n" +
      String(patch.patch_text || "").trim() +
      "\n" +
      footer +
      "\n";

    const { error: upErr } = await supabase
      .from("agents")
      .update({
        system_prompt: newPrompt,
        version: (agent.version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agent.id);

    if (upErr) throw upErr;

    return json(200, { ok: true, agent: patch.agent_name, version: (agent.version ?? 1) + 1 });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Bad Request";
    return json(400, { error: msg });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
