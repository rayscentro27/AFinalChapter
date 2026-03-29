#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_FILE = 'data/training/custom/credit_sources_crm_training_distiller_payload_2026-02-19.json';

function parseArgs(argv) {
  const out = {
    file: DEFAULT_FILE,
    autoApply: true,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];

    if (a === '--file' && next) {
      out.file = next;
      i += 1;
    } else if (a === '--no-auto-apply') {
      out.autoApply = false;
    } else if (a === '--dry-run') {
      out.dryRun = true;
    }
  }

  return out;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const idx = line.indexOf('=');
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function requireString(v, label) {
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return v.trim();
}

function ensureArray(v, label) {
  if (!Array.isArray(v)) throw new Error(`${label} must be an array`);
  return v;
}

function sha256(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

async function safeInsertImportRun(supabase, payload) {
  try {
    await supabase.from('import_runs').insert({
      title: payload.title,
      raw_payload: payload,
    });
  } catch {
    // Optional table.
  }
}

async function ensureHistory(supabase, agentId, promptVersion, systemPrompt) {
  try {
    await supabase.from('agent_prompt_history').insert({
      agent_id: agentId,
      prompt_version: promptVersion,
      system_prompt: systemPrompt,
    });
  } catch {
    // Optional table.
  }
}

async function applyPatchesToAgents(supabase, patches) {
  const applied = [];
  const skipped = [];
  const failed = [];

  const byAgent = new Map();
  for (const p of patches) {
    if (!byAgent.has(p.agent_name)) byAgent.set(p.agent_name, []);
    byAgent.get(p.agent_name).push(p);
  }

  for (const [agentName, agentPatches] of byAgent.entries()) {
    try {
      const { data: agent, error: agentErr } = await supabase
        .from('agents')
        .select('id, name, system_prompt, version')
        .eq('name', agentName)
        .single();

      if (agentErr || !agent) throw new Error(`Agent not found: ${agentName}`);

      const currentPrompt = String(agent.system_prompt || '').trim();
      await ensureHistory(supabase, agent.id, agent.version ?? 1, currentPrompt);

      const blocks = [];
      for (const p of agentPatches) {
        const patchHash = sha256(`${agentName}||${p.patch_title}||${p.patch_text}`);
        if (currentPrompt.includes(`PATCH_HASH: ${patchHash}`)) {
          skipped.push({ agent_name: agentName, patch_title: p.patch_title, reason: 'Already applied' });
          continue;
        }

        const block =
          '\n\n---- TRAINING PATCH ----\n' +
          `PATCH_TITLE: ${p.patch_title}\n` +
          `PATCH_HASH: ${patchHash}\n` +
          String(p.patch_text || '').trim() +
          '\n---- END PATCH ----\n';

        blocks.push({ patch_title: p.patch_title, block });
      }

      if (!blocks.length) continue;

      const newPrompt = currentPrompt + blocks.map((b) => b.block).join('');
      const newVersion = Number(agent.version || 1) + 1;

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

      for (const b of blocks) {
        applied.push({ agent_name: agentName, patch_title: b.patch_title, new_version: newVersion });
      }
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message : String(err);
      for (const p of agentPatches) {
        failed.push({ agent_name: agentName, patch_title: p.patch_title, error: message });
      }
    }
  }

  return { applied, skipped, failed };
}

async function insertScenarioPack(supabase, payload) {
  if (!payload.scenario_pack.length) return { inserted: false, mode: 'none' };

  const fallbackAgent = payload.scenario_pack[0]?.agent_name || 'Nexus Analyst';
  const rowWithAgent = {
    title: payload.title,
    agent_name: fallbackAgent,
    scenarios: payload.scenario_pack,
  };

  const rowNoAgent = {
    title: payload.title,
    scenarios: payload.scenario_pack,
  };

  const tryUpsert = await supabase
    .from('scenario_packs')
    .upsert(rowWithAgent, { onConflict: 'title,agent_name' });

  if (!tryUpsert.error) return { inserted: true, mode: 'upsert:title,agent_name' };

  const tryInsertWithAgent = await supabase.from('scenario_packs').insert(rowWithAgent);
  if (!tryInsertWithAgent.error) return { inserted: true, mode: 'insert:with_agent' };

  const errTxt = String(tryInsertWithAgent.error?.message || tryUpsert.error?.message || '');
  const looksLikeAgentSchemaMismatch =
    errTxt.toLowerCase().includes('agent_name') || errTxt.toLowerCase().includes('column');

  if (!looksLikeAgentSchemaMismatch) {
    throw new Error(`Failed to insert scenario pack: ${tryInsertWithAgent.error?.message || tryUpsert.error?.message}`);
  }

  const tryInsertNoAgent = await supabase.from('scenario_packs').insert(rowNoAgent);
  if (tryInsertNoAgent.error) {
    throw new Error(`Failed to insert scenario pack (legacy retry): ${tryInsertNoAgent.error.message}`);
  }

  return { inserted: true, mode: 'insert:legacy_no_agent' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  loadEnvFile('.env.local');

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase envs. Need VITE_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  const absFile = path.resolve(args.file);
  if (!fs.existsSync(absFile)) throw new Error(`Payload file not found: ${absFile}`);

  const payload = JSON.parse(fs.readFileSync(absFile, 'utf8'));

  requireString(payload.title, 'title');
  if (payload.playbook) {
    requireString(payload.playbook.title, 'playbook.title');
    ensureArray(payload.playbook.rules || [], 'playbook.rules');
    ensureArray(payload.playbook.checklist || [], 'playbook.checklist');
  }

  const patches = ensureArray(payload.prompt_patches || [], 'prompt_patches');
  const scenarios = ensureArray(payload.scenario_pack || [], 'scenario_pack');

  console.log(`PAYLOAD ${absFile}`);
  console.log(`TITLE ${payload.title}`);
  console.log(`PATCHES ${patches.length}`);
  console.log(`SCENARIOS ${scenarios.length}`);

  if (args.dryRun) {
    console.log('DRY_RUN_ONLY');
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  await safeInsertImportRun(supabase, payload);

  let playbookId = null;
  if (payload.playbook) {
    const { data: pb, error: pbErr } = await supabase
      .from('playbooks')
      .insert({
        title: payload.playbook.title,
        summary: payload.playbook.summary || '',
        rules: payload.playbook.rules || [],
        checklist: payload.playbook.checklist || [],
        templates: payload.playbook.templates || {},
      })
      .select('id')
      .single();

    if (pbErr) throw new Error(`Failed to insert playbook: ${pbErr.message}`);
    playbookId = pb?.id || null;
  }

  if (patches.length) {
    const { error: patchErr } = await supabase.from('prompt_patches').insert(
      patches.map((p) => ({
        agent_name: p.agent_name,
        patch_title: p.patch_title,
        patch_text: p.patch_text,
      }))
    );
    if (patchErr) throw new Error(`Failed to insert prompt patches: ${patchErr.message}`);
  }

  const scenarioResult = await insertScenarioPack(supabase, payload);

  const patchResults = args.autoApply
    ? await applyPatchesToAgents(supabase, patches)
    : { applied: [], skipped: [], failed: [] };

  const summary = {
    ok: true,
    title: payload.title,
    playbook_id: playbookId,
    patches_inserted: patches.length,
    scenarios_inserted: scenarios.length,
    scenario_insert_mode: scenarioResult.mode,
    auto_apply: args.autoApply,
    patches_applied: patchResults.applied.length,
    patches_skipped: patchResults.skipped.length,
    patches_failed: patchResults.failed.length,
    applied: patchResults.applied,
    skipped: patchResults.skipped,
    failed: patchResults.failed,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(`ERROR ${err?.message || String(err)}`);
  process.exit(1);
});
