import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const EmployeeSchema = z
  .object({
    agent_name: z.string().min(1),
    base_prompt: z.string().optional().default(''),
    system_prompt: z.string().optional().default(''),
  })
  .passthrough();

const PlaybookSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().optional().default(''),
    rules: z.array(z.string()).optional().default([]),
    checklist: z.array(z.string()).optional().default([]),
    templates: z.unknown().optional().default({}),
  })
  .passthrough();

const ScenarioPackSchema = z
  .object({
    title: z.string().min(1),
    agent_name: z.string().min(1),
    scenarios: z.array(z.unknown()).optional().default([]),
  })
  .passthrough();

const BundleSchema = z
  .object({
    bundle_version: z.string().min(1),
    generated_at: z.string().optional(),
    global: z.unknown(),
    employees: z.array(EmployeeSchema),
    playbooks: z.array(PlaybookSchema),
    scenario_packs: z.array(ScenarioPackSchema),
    scoring_models: z.unknown(),
  })
  .passthrough();

type Bundle = z.infer<typeof BundleSchema>;

type AgentRow = {
  id: string;
  name: string;
  base_prompt: string | null;
  system_prompt: string;
  version: number;
  division: string;
  role: string;
};

type PlaybookRow = {
  id: string;
  slug: string;
  doc_id: string | null;
};

type ScenarioPackRow = {
  id: string;
  title: string;
  agent_name: string;
  doc_id: string | null;
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const expectedToken = process.env.ADMIN_IMPORT_TOKEN;
    const gotToken = header(event, 'x-admin-import-token');
    if (!expectedToken || gotToken !== expectedToken) {
      return json(401, { error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(500, {
        error: 'Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
      });
    }

    const raw = readRawBody(event);
    const bundle = BundleSchema.parse(raw ?? readBundleFromFs());

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1) Upsert config blobs
    await upsertConfig(supabase, bundle);

    // 2) Upsert agents (version bumps only when prompt fields change)
    const agentResult = await upsertAgents(supabase, bundle);

    // 3) Upsert playbooks (idempotent via playbooks.slug unique)
    const playbookResult = await upsertPlaybooks(supabase, bundle);

    // 4) Upsert scenario packs (idempotent via (title, agent_name) unique)
    const scenarioResult = await upsertScenarioPacks(supabase, bundle);

    const summary = {
      ok: true,
      agents_upserted: agentResult.inserted + agentResult.updated,
      playbooks_upserted: playbookResult.inserted + playbookResult.updated,
      scenario_packs_upserted: scenarioResult.inserted + scenarioResult.updated,
      config_upserted: ['training_global', 'scoring_models'],
      bundle_version: bundle.bundle_version,
      generated_at: bundle.generated_at ?? new Date().toISOString(),
      details: {
        agents: agentResult,
        playbooks: playbookResult,
        scenario_packs: scenarioResult,
      },
    };

    console.log('[import_training_bundle] summary', summary);

    return json(200, summary);
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'Bad Request';
    return json(400, { error: msg });
  }
};

function header(event: any, name: string) {
  const headers = event.headers || {};
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === target) return String(v);
  }
  return '';
}

function readRawBody(event: any): unknown | null {
  if (!event.body) return null;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : String(event.body);
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function readBundleFromFs(): unknown {
  const p = path.join(process.cwd(), 'data', 'training', 'initial_training_bundle.json');
  const s = fs.readFileSync(p, 'utf8');
  return JSON.parse(s);
}

async function upsertConfig(supabase: ReturnType<typeof createClient>, bundle: Bundle) {
  // Requires migration: public.nexus_config
  const rows = [
    { key: 'training_global', value: bundle.global, updated_at: new Date().toISOString() },
    { key: 'scoring_models', value: bundle.scoring_models, updated_at: new Date().toISOString() },
  ];

  const { error } = await supabase.from('nexus_config').upsert(rows as any, { onConflict: 'key' });
  if (error) {
    throw new Error(
      `Failed to upsert nexus_config (did you run migration 20260218193000_training_bundle_config.sql?): ${error.message}`
    );
  }
}

async function upsertAgents(supabase: ReturnType<typeof createClient>, bundle: Bundle) {
  const names = bundle.employees.map((e) => e.agent_name);

  const { data: existing, error } = await supabase
    .from('agents')
    .select('id, name, base_prompt, system_prompt, version, division, role')
    .in('name', names);

  if (error) throw new Error(`Failed to query agents: ${error.message}`);

  const byName = new Map<string, AgentRow>();
  for (const a of (existing || []) as any[]) byName.set(String(a.name), a as AgentRow);

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const emp of bundle.employees) {
    const name = emp.agent_name;
    const base_prompt = String(emp.base_prompt || '').trim();
    const system_prompt = String(emp.system_prompt || '').trim();

    const cur = byName.get(name);
    if (!cur) {
      const { error: insErr } = await supabase.from('agents').insert({
        name,
        division: 'nexus',
        role: 'employee',
        base_prompt,
        system_prompt,
        version: 1,
      } as any);

      if (insErr) throw new Error(`Failed to insert agent ${name}: ${insErr.message}`);
      inserted++;
      continue;
    }

    const curBase = String(cur.base_prompt || '').trim();
    const curSys = String(cur.system_prompt || '').trim();

    if (curBase === base_prompt && curSys === system_prompt) {
      unchanged++;
      continue;
    }

    const newVersion = Number(cur.version || 1) + 1;

    const { error: upErr } = await supabase
      .from('agents')
      .update({
        base_prompt,
        system_prompt,
        version: newVersion,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', cur.id);

    if (upErr) throw new Error(`Failed to update agent ${name}: ${upErr.message}`);
    updated++;
  }

  return { inserted, updated, unchanged };
}

function slugify(s: string) {
  const cleaned = String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return cleaned || 'untitled';
}

function stableStringify(v: unknown): string {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (t === 'object') {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

async function upsertPlaybooks(supabase: ReturnType<typeof createClient>, bundle: Bundle) {
  const slugCounts = new Map<string, number>();
  const desired = bundle.playbooks.map((pb) => {
    const base = slugify(pb.title);
    const n = (slugCounts.get(base) || 0) + 1;
    slugCounts.set(base, n);
    const slug = n === 1 ? base : `${base}-${n}`;

    return {
      slug,
      title: pb.title,
      summary: pb.summary ?? '',
      rules: pb.rules ?? [],
      checklist: pb.checklist ?? [],
      templates: pb.templates ?? {},
    };
  });

  const slugs = desired.map((d) => d.slug);

  const { data: existing, error } = await supabase
    .from('playbooks')
    .select('id, slug, doc_id, title, summary, rules, checklist, templates')
    .in('slug', slugs);

  if (error) {
    throw new Error(
      `Failed to query playbooks (did you run migration 20260218193000_training_bundle_config.sql?): ${error.message}`
    );
  }

  const bySlug = new Map<string, any>();
  for (const r of existing || []) bySlug.set(String((r as any).slug), r);

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  const payload = desired.map((d) => {
    const cur = bySlug.get(d.slug);
    if (!cur) {
      inserted++;
      return { doc_id: null, ...d };
    }

    const changed =
      String(cur.title || '') !== d.title ||
      String(cur.summary || '') !== d.summary ||
      stableStringify(cur.rules || []) !== stableStringify(d.rules) ||
      stableStringify(cur.checklist || []) !== stableStringify(d.checklist) ||
      stableStringify(cur.templates || {}) !== stableStringify(d.templates);

    if (changed) updated++;
    else unchanged++;

    return { doc_id: cur.doc_id ?? null, ...d };
  });

  const { error: upErr } = await supabase.from('playbooks').upsert(payload as any, { onConflict: 'slug' });
  if (upErr) throw new Error(`Failed to upsert playbooks: ${upErr.message}`);

  return { inserted, updated, unchanged };
}

async function upsertScenarioPacks(supabase: ReturnType<typeof createClient>, bundle: Bundle) {
  const titles = bundle.scenario_packs.map((p) => p.title);

  // Fetch by title and filter locally (Supabase doesn't support composite IN nicely).
  const { data: existing, error } = await supabase
    .from('scenario_packs')
    .select('id, title, agent_name, doc_id, scenarios')
    .in('title', titles);

  if (error) {
    throw new Error(
      `Failed to query scenario_packs (did you run migration 20260218193000_training_bundle_config.sql?): ${error.message}`
    );
  }

  const byKey = new Map<string, any>();
  for (const r of existing || []) {
    const rr = r as any;
    byKey.set(`${String(rr.title)}||${String(rr.agent_name)}`, rr);
  }

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  const payload = bundle.scenario_packs.map((p) => {
    const key = `${p.title}||${p.agent_name}`;
    const cur = byKey.get(key);

    const scenarios = p.scenarios ?? [];

    if (!cur) {
      inserted++;
      return {
        doc_id: null,
        title: p.title,
        agent_name: p.agent_name,
        scenarios,
      };
    }

    const changed = stableStringify(cur.scenarios || []) !== stableStringify(scenarios);
    if (changed) updated++;
    else unchanged++;

    return {
      doc_id: cur.doc_id ?? null,
      title: p.title,
      agent_name: p.agent_name,
      scenarios,
    };
  });

  const { error: upErr } = await supabase
    .from('scenario_packs')
    .upsert(payload as any, { onConflict: 'title,agent_name' });

  if (upErr) throw new Error(`Failed to upsert scenario_packs: ${upErr.message}`);

  return { inserted, updated, unchanged };
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
