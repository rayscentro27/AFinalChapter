import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import crypto from "crypto";

const ImportSchema = z.object({
  auto_apply: z.boolean().optional().default(true),
  doc_id: z.string().uuid().optional(),
  title: z.string().min(1),

  playbook: z
    .object({
      title: z.string().min(1),
      summary: z.string().optional().default(""),
      rules: z.array(z.string()).optional().default([]),
      checklist: z.array(z.string()).optional().default([]),
      templates: z.unknown().optional().default({}),
    })
    .optional(),

  prompt_patches: z
    .array(
      z.object({
        agent_name: z.string().min(1),
        patch_title: z.string().min(1),
        patch_text: z.string().min(1),
      })
    )
    .optional()
    .default([]),

  scenario_pack: z
    .array(
      z.object({
        agent_name: z.string().min(1),
        division: z.string().optional(),
        title: z.string().min(1),
        difficulty: z.number().min(1).max(5),
        user_message: z.string().min(1),
        expected_behavior: z.string().min(1),
        must_include: z.array(z.string()).optional().default([]),
        must_not_say: z.array(z.string()).optional().default([]),
        ideal_response: z.string().min(1),
        tags: z.array(z.string()).optional().default([]),
      })
    )
    .optional()
    .default([]),
});

type PatchIn = {
  agent_name: string;
  patch_title: string;
  patch_text: string;
};

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

    const body = ImportSchema.parse(JSON.parse(event.body || "{}"));

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 0) optional run log (ignore if table doesn't exist)
    await safeInsertImportRun(supabase, body);

    // 1) playbook
    let playbookId: string | null = null;
    if (body.playbook) {
      const { data: pb, error: pbErr } = await supabase
        .from("playbooks")
        .insert({
          doc_id: body.doc_id ?? null,
          title: body.playbook.title,
          summary: body.playbook.summary,
          rules: body.playbook.rules,
          checklist: body.playbook.checklist,
          templates: body.playbook.templates,
        })
        .select("id")
        .single();

      if (pbErr) throw pbErr;
      playbookId = pb?.id ?? null;
    }

    // 2) patches rows
    if (body.prompt_patches.length > 0) {
      const { error: patchInsertErr } = await supabase.from("prompt_patches").insert(
        body.prompt_patches.map((p) => ({
          doc_id: body.doc_id ?? null,
          agent_name: p.agent_name,
          patch_title: p.patch_title,
          patch_text: p.patch_text,
        }))
      );

      if (patchInsertErr) throw patchInsertErr;
    }

    // 3) scenario pack row (single row holding array)
    if (body.scenario_pack.length > 0) {
      const { error: sErr } = await supabase.from("scenario_packs").insert({
        doc_id: body.doc_id ?? null,
        title: body.title,
        scenarios: body.scenario_pack,
      });

      if (sErr) throw sErr;
    }

    // 4) optional auto-apply patches (dedupe by PATCH_HASH markers)
    const applyResults = body.auto_apply ? await applyPatchesToAgents(supabase, body.prompt_patches) : { applied: [], skipped: [], failed: [] };

    return json(200, {
      ok: true,
      playbook_id: playbookId,
      patches_inserted: body.prompt_patches.length,
      scenarios_inserted: body.scenario_pack.length,
      patches_applied: applyResults.applied.length,
      patches_skipped: applyResults.skipped.length,
      patches_failed: applyResults.failed.length,
      applied: applyResults.applied,
      skipped: applyResults.skipped,
      failed: applyResults.failed,
    });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Bad Request";
    return json(400, { error: msg });
  }
};

async function safeInsertImportRun(supabase: ReturnType<typeof createClient>, body: any) {
  try {
    await supabase.from("import_runs").insert({
      doc_id: body.doc_id ?? null,
      title: body.title,
      raw_payload: body,
    });
  } catch {
    // ignore
  }
}


async function ensureHistory(supabase: ReturnType<typeof createClient>, agentId: string, promptVersion: number, systemPrompt: string) {
  try {
    await supabase.from('agent_prompt_history').insert({
      agent_id: agentId,
      prompt_version: promptVersion,
      system_prompt: systemPrompt,
    });
  } catch {
    // ignore (duplicates / missing table)
  }
}

async function applyPatchesToAgents(supabase: ReturnType<typeof createClient>, patches: PatchIn[]) {
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
        .from("agents")
        .select("id, name, system_prompt, version")
        .eq("name", agent_name)
        .single();

      if (agentErr || !agent) throw new Error(`Agent not found: ${agent_name}`);

      await ensureHistory(supabase, agent.id, agent.version ?? 1, String(agent.system_prompt || ''));

      const base = String(agent.system_prompt || "").trim();
      const blocksToAppend: Array<{ patch_title: string; block: string }> = [];

      for (const p of agentPatches) {
        const patchHash = sha256(`${agent_name}||${p.patch_title}||${p.patch_text}`);
        if (base.includes(`PATCH_HASH: ${patchHash}`)) {
          skipped.push({ agent_name, patch_title: p.patch_title, reason: "Already applied (hash match)" });
          continue;
        }

        const block =
          "\n\n---- TRAINING PATCH ----\n" +
          `PATCH_TITLE: ${p.patch_title}\n` +
          `PATCH_HASH: ${patchHash}\n` +
          String(p.patch_text || "").trim() +
          "\n---- END PATCH ----\n";

        blocksToAppend.push({ patch_title: p.patch_title, block });
      }

      if (blocksToAppend.length === 0) continue;

      const newPrompt = base + blocksToAppend.map((b) => b.block).join("");
      const newVersion = (agent.version ?? 1) + 1;

      const { error: upErr } = await supabase
        .from("agents")
        .update({
          system_prompt: newPrompt,
          version: newVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", agent.id);

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
          error: typeof err?.message === "string" ? err.message : "Unknown error",
        });
      }
    }
  }

  return { applied, skipped, failed };
}

function sha256(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
