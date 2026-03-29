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

function randomPassword() {
  return `Nexus!${Math.random().toString(36).slice(2, 10)}A1`;
}

function tokenPreview(token) {
  const t = String(token || '');
  if (t.length <= 20) return t;
  return `${t.slice(0, 12)}...${t.slice(-10)}`;
}

async function resolveRoleRecord({ sb, tenantId, role }) {
  const requestedRole = String(role || '').trim().toLowerCase();
  if (!requestedRole) return null;

  const { data, error } = await sb
    .from('tenant_roles')
    .select('id,key,name')
    .eq('tenant_id', tenantId)
    .eq('key', requestedRole)
    .maybeSingle();

  if (error) {
    const msg = String(error.message || '');
    if (msg.includes("Could not find the table 'public.tenant_roles'")) return null;
    throw new Error(`tenant_roles lookup failed: ${error.message}`);
  }

  return data || null;
}

async function normalizeMembershipRole({ sb, table, tenantId, userId, role, roleRecord }) {
  const updatePayload = {
    role,
    ...(roleRecord?.id ? { role_id: roleRecord.id } : {}),
  };

  const normalized = await sb
    .from(table)
    .update(updatePayload)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .select('tenant_id,user_id,role,role_id')
    .maybeSingle();

  if (normalized.error) {
    throw new Error(`${table} role normalization failed: ${normalized.error.message}`);
  }

  return normalized.data || null;
}

async function upsertMembership({ sb, tenantId, userId, role }) {
  const payload = { tenant_id: tenantId, user_id: userId, role };
  const roleRecord = await resolveRoleRecord({ sb, tenantId, role });

  const first = await sb
    .from('tenant_memberships')
    .upsert(payload, { onConflict: 'tenant_id,user_id' })
    .select('tenant_id,user_id,role,role_id')
    .maybeSingle();

  if (!first.error) {
    const row = first.data || null;
    const needsNormalization = row && (
      String(row.role || '').toLowerCase() !== String(role || '').toLowerCase()
      || (roleRecord?.id && String(row.role_id || '') !== String(roleRecord.id))
    );

    return {
      table: 'tenant_memberships',
      row: needsNormalization
        ? await normalizeMembershipRole({ sb, table: 'tenant_memberships', tenantId, userId, role, roleRecord })
        : row,
    };
  }

  const msg = String(first.error.message || '');
  if (!msg.includes("Could not find the table 'public.tenant_memberships'")) {
    throw new Error(`tenant_memberships upsert failed: ${first.error.message}`);
  }

  const fallback = await sb
    .from('tenant_members')
    .upsert(payload, { onConflict: 'tenant_id,user_id' })
    .select('tenant_id,user_id,role,role_id')
    .maybeSingle();

  if (fallback.error) {
    throw new Error(`tenant_members upsert failed: ${fallback.error.message}`);
  }

  const row = fallback.data || null;
  const needsNormalization = row && (
    String(row.role || '').toLowerCase() !== String(role || '').toLowerCase()
    || (roleRecord?.id && String(row.role_id || '') !== String(roleRecord.id))
  );

  return {
    table: 'tenant_members',
    row: needsNormalization
      ? await normalizeMembershipRole({ sb, table: 'tenant_members', tenantId, userId, role, roleRecord })
      : row,
  };
}

async function main() {
  const env = {
    ...parseEnvFile(path.join(process.cwd(), 'gateway/.env')),
    ...process.env,
  };

  const supabaseUrl = required('SUPABASE_URL', env.SUPABASE_URL);
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY);
  const tenantId = required('tenant-id', readArg('tenant-id', env.SMOKE_TENANT_ID));
  const role = readArg('role', 'admin').trim() || 'admin';
  const email = readArg('email', `codex.smoke.admin.${Date.now()}@example.com`).trim();
  const password = readArg('password', randomPassword()).trim();
  const outTokenPath = readArg('token-out', '.secrets/real_user_bearer_token.txt').trim();
  const outMetaPath = readArg('meta-out', '.secrets/real_user_bearer_token.meta.json').trim();
  const noWrite = readArg('no-write', 'false').toLowerCase() === 'true';

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const created = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      source: 'codex-smoke-admin',
    },
  });

  if (created.error) {
    throw new Error(`createUser failed: ${created.error.message}`);
  }

  const userId = created.data?.user?.id;
  if (!userId) {
    throw new Error('createUser succeeded but returned no user id');
  }

  const membership = await upsertMembership({
    sb,
    tenantId,
    userId,
    role,
  });

  const signIn = await sb.auth.signInWithPassword({ email, password });
  if (signIn.error) {
    throw new Error(`signInWithPassword failed: ${signIn.error.message}`);
  }

  const accessToken = signIn.data?.session?.access_token;
  if (!accessToken) {
    throw new Error('signInWithPassword succeeded but no access token returned');
  }

  const summary = {
    created_at: new Date().toISOString(),
    tenant_id: tenantId,
    user_id: userId,
    email,
    role,
    membership_table: membership.table,
    membership_row: membership.row || null,
    token_preview: tokenPreview(accessToken),
  };

  if (!noWrite) {
    fs.mkdirSync(path.dirname(outTokenPath), { recursive: true });
    fs.mkdirSync(path.dirname(outMetaPath), { recursive: true });
    fs.writeFileSync(outTokenPath, `${accessToken}\n`, 'utf8');
    fs.writeFileSync(outMetaPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify({
    ok: true,
    wrote_files: !noWrite,
    token_file: noWrite ? null : outTokenPath,
    meta_file: noWrite ? null : outMetaPath,
    ...summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2));
  process.exit(1);
});
