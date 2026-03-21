#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function readArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  return fallback;
}

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    out[key] = value;
  }
  return out;
}

function required(name, value) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`Missing required value: ${name}`);
  return text;
}

function isSmokeUser(user) {
  const email = String(user?.email || '').toLowerCase();
  const source = String(user?.user_metadata?.source || '').toLowerCase();
  return email.startsWith('codex.smoke.admin.') || source.includes('codex-smoke-admin');
}

async function main() {
  const env = {
    ...parseEnvFile(path.join(process.cwd(), 'gateway/.env')),
    ...process.env,
  };

  const supabaseUrl = required('SUPABASE_URL', env.SUPABASE_URL);
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY);
  const dryRun = readArg('dry-run', 'false').toLowerCase() === 'true';

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const targets = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const res = await sb.auth.admin.listUsers({ page, perPage });
    if (res.error) {
      throw new Error(`listUsers page ${page} failed: ${res.error.message}`);
    }

    const users = res.data?.users || [];
    for (const user of users) {
      if (isSmokeUser(user)) {
        targets.push({
          id: user.id,
          email: user.email || null,
          source: user.user_metadata?.source || null,
          created_at: user.created_at || null,
        });
      }
    }

    if (users.length < perPage) break;
    page += 1;
  }

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dry_run: true, count: targets.length, users: targets }, null, 2));
    return;
  }

  const results = [];

  for (const user of targets) {
    const row = {
      id: user.id,
      email: user.email,
      membership_deleted: false,
      user_deleted: false,
      errors: [],
    };

    try {
      const m1 = await sb.from('tenant_memberships').delete().eq('user_id', user.id);
      if (m1.error) {
        row.errors.push(`tenant_memberships delete failed: ${m1.error.message}`);
      } else {
        row.membership_deleted = true;
      }
    } catch (error) {
      row.errors.push(`tenant_memberships delete exception: ${String(error?.message || error)}`);
    }

    try {
      const m2 = await sb.from('tenant_members').delete().eq('user_id', user.id);
      const tableMissing = String(m2.error?.message || '').includes("Could not find the table 'public.tenant_members'");
      if (m2.error && !tableMissing) {
        row.errors.push(`tenant_members delete failed: ${m2.error.message}`);
      }
    } catch (error) {
      row.errors.push(`tenant_members delete exception: ${String(error?.message || error)}`);
    }

    try {
      const del = await sb.auth.admin.deleteUser(user.id);
      if (del.error) {
        row.errors.push(`deleteUser failed: ${del.error.message}`);
      } else {
        row.user_deleted = true;
      }
    } catch (error) {
      row.errors.push(`deleteUser exception: ${String(error?.message || error)}`);
    }

    results.push(row);
  }

  console.log(JSON.stringify({ ok: true, dry_run: false, count: results.length, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2));
  process.exit(1);
});
