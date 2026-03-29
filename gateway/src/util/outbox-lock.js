import { supabaseAdmin as defaultSupabaseAdmin } from '../supabase.js';

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return String(value || '').toLowerCase() === 'true';
}

function isMissingFunction(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('function')
    && message.includes('does not exist')
  );
}

export async function tryAcquireTenantOutboxLock({ supabaseAdmin = defaultSupabaseAdmin, tenantId }) {
  const tenant_id = asText(tenantId);
  if (!tenant_id) {
    return { acquired: false, reason: 'missing_tenant_id' };
  }

  const { data, error } = await supabaseAdmin.rpc('try_acquire_tenant_outbox_lock', {
    p_tenant_id: tenant_id,
  });

  if (error) {
    if (isMissingFunction(error)) {
      return { acquired: false, reason: 'lock_rpc_missing' };
    }
    throw new Error(`lock acquire failed: ${error.message}`);
  }

  if (!asBool(data)) {
    return { acquired: false, reason: 'lock_not_acquired' };
  }

  return { acquired: true, reason: null };
}

export async function releaseTenantOutboxLock({ supabaseAdmin = defaultSupabaseAdmin, tenantId }) {
  const tenant_id = asText(tenantId);
  if (!tenant_id) return { released: false };

  const { data, error } = await supabaseAdmin.rpc('release_tenant_outbox_lock', {
    p_tenant_id: tenant_id,
  });

  if (error) {
    if (isMissingFunction(error)) {
      return { released: false, reason: 'lock_rpc_missing' };
    }
    throw new Error(`lock release failed: ${error.message}`);
  }

  return { released: asBool(data), reason: null };
}
