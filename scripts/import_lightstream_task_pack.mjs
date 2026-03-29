#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_TEMPLATE = 'data/training/custom/lightstream_client_tasks_schema_mapped.json';

function parseArgs(argv) {
  const out = {
    file: DEFAULT_TEMPLATE,
    tenant: '',
    startDate: '',
    writePrefill: '',
    dryRun: false,
    noImport: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--file' && next) {
      out.file = next;
      i += 1;
    } else if (a === '--tenant' && next) {
      out.tenant = next;
      i += 1;
    } else if (a === '--start-date' && next) {
      out.startDate = next;
      i += 1;
    } else if (a === '--write-prefill' && next) {
      out.writePrefill = next;
      i += 1;
    } else if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--no-import') {
      out.noImport = true;
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

function mustDate(s, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${label} must be YYYY-MM-DD`);
  return s;
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v || '');
}

function resolveDateStart(startDateArg) {
  if (startDateArg) return mustDate(startDateArg, '--start-date');
  return new Date().toISOString().slice(0, 10);
}

function normalizeTasks(templateJson, tenantId, startDate) {
  const tasks = Array.isArray(templateJson?.tasks) ? templateJson.tasks : [];
  if (!tasks.length) throw new Error('No tasks[] found in JSON pack');

  return tasks.map((t) => {
    const offset = Number(t?.meta?.due_offset_days || 0);
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(t?.due_date || '')) && !String(t.due_date).includes('<')
      ? String(t.due_date)
      : addDays(startDate, offset);

    return {
      tenant_id: tenantId,
      task_id: String(t.task_id),
      title: String(t.title),
      description: t.description == null ? null : String(t.description),
      status: t.status === 'completed' ? 'completed' : 'pending',
      due_date: dueDate,
      type: String(t.type),
      signal: String(t.signal || 'yellow'),
      assigned_employee: t.assigned_employee == null ? null : String(t.assigned_employee),
      group_key: t.group_key == null ? null : String(t.group_key),
      template_key: t.template_key == null ? null : String(t.template_key),
      link: t.link == null ? null : String(t.link),
      meeting_time: t.meeting_time == null ? null : String(t.meeting_time),
      linked_to_goal: typeof t.linked_to_goal === 'boolean' ? t.linked_to_goal : null,
      meta: t.meta && typeof t.meta === 'object' ? t.meta : {},
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile('.env.local');

  if (!args.tenant || !isUuid(args.tenant)) {
    throw new Error('Provide a valid --tenant <uuid>');
  }

  const startDate = resolveDateStart(args.startDate);
  const absFile = path.resolve(args.file);

  if (!fs.existsSync(absFile)) {
    throw new Error(`Task pack not found: ${absFile}`);
  }

  const raw = fs.readFileSync(absFile, 'utf8');
  const json = JSON.parse(raw);
  const tasks = normalizeTasks(json, args.tenant, startDate);

  const prefilled = {
    ...json,
    tenant_id: args.tenant,
    start_date: startDate,
    tasks,
  };

  if (args.writePrefill) {
    const outPath = path.resolve(args.writePrefill);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(prefilled, null, 2)}\n`, 'utf8');
    console.log(`WROTE_PREFILL ${outPath}`);
  }

  console.log(`TASKS_READY ${tasks.length}`);

  if (args.noImport || args.dryRun) {
    console.log('DRY_RUN_ONLY');
    return;
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase envs. Need VITE_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('client_tasks')
    .upsert(tasks, { onConflict: 'tenant_id,task_id' })
    .select('task_id, due_date, status, signal, assigned_employee');

  if (error) throw new Error(`Upsert failed: ${error.message}`);

  console.log(`UPSERT_OK ${data?.length || 0}`);
}

main().catch((err) => {
  console.error(`ERROR ${err?.message || String(err)}`);
  process.exit(1);
});
