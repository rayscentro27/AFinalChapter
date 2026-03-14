import { ENV } from '../env.js';

export const VALID_SYSTEM_MODES = new Set(['development', 'research', 'production', 'maintenance']);

const LAST_PAUSE_SNAPSHOT_BY_TENANT = new Map();

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function clampInt(value, min, max, fallback) {
  const n = asInt(value, fallback);
  return Math.min(max, Math.max(min, n));
}

function snapshot() {
  return {
    system_mode: asText(ENV.SYSTEM_MODE || 'development').toLowerCase() || 'development',
    queue_enabled: Boolean(ENV.QUEUE_ENABLED),
    ai_jobs_enabled: Boolean(ENV.AI_JOBS_ENABLED),
    research_jobs_enabled: Boolean(ENV.RESEARCH_JOBS_ENABLED),
    notifications_enabled: Boolean(ENV.NOTIFICATIONS_ENABLED),
    job_max_runtime_seconds: Number(ENV.JOB_MAX_RUNTIME_SECONDS || 300),
    worker_max_concurrency: Number(ENV.WORKER_MAX_CONCURRENCY || 4),
    tenant_job_limit_active: Number(ENV.TENANT_JOB_LIMIT_ACTIVE || 20),
  };
}

function applyState(nextState) {
  ENV.SYSTEM_MODE = asText(nextState.system_mode || ENV.SYSTEM_MODE || 'development').toLowerCase() || 'development';
  ENV.QUEUE_ENABLED = Boolean(nextState.queue_enabled);
  ENV.AI_JOBS_ENABLED = Boolean(nextState.ai_jobs_enabled);
  ENV.RESEARCH_JOBS_ENABLED = Boolean(nextState.research_jobs_enabled);
  ENV.NOTIFICATIONS_ENABLED = Boolean(nextState.notifications_enabled);
  ENV.JOB_MAX_RUNTIME_SECONDS = Number(nextState.job_max_runtime_seconds || 300);
  ENV.WORKER_MAX_CONCURRENCY = Number(nextState.worker_max_concurrency || 4);
  ENV.TENANT_JOB_LIMIT_ACTIVE = Number(nextState.tenant_job_limit_active || 20);
  return snapshot();
}

function changed(previous, current) {
  const out = {};
  for (const key of Object.keys(current)) {
    if (previous[key] !== current[key]) {
      out[key] = { previous: previous[key], current: current[key] };
    }
  }
  return out;
}

function tenantSnapshotKey(tenantId) {
  const id = asText(tenantId);
  return id || '__global__';
}

export function getSystemControlState() {
  return snapshot();
}

export function setSystemMode(mode) {
  const target = asText(mode).toLowerCase();
  if (!VALID_SYSTEM_MODES.has(target)) {
    return {
      ok: false,
      error: 'invalid_system_mode',
      details: {
        mode: target || null,
        valid_modes: Array.from(VALID_SYSTEM_MODES),
      },
    };
  }

  const previous = snapshot();
  const current = applyState({
    ...previous,
    system_mode: target,
  });

  return {
    ok: true,
    previous,
    current,
    changed: changed(previous, current),
  };
}

export function updateSystemFlags(patch = {}) {
  const previous = snapshot();
  const next = { ...previous };

  let changedCount = 0;

  if (patch.queue_enabled !== undefined) {
    next.queue_enabled = asBool(patch.queue_enabled, next.queue_enabled);
    changedCount += 1;
  }
  if (patch.ai_jobs_enabled !== undefined) {
    next.ai_jobs_enabled = asBool(patch.ai_jobs_enabled, next.ai_jobs_enabled);
    changedCount += 1;
  }
  if (patch.research_jobs_enabled !== undefined) {
    next.research_jobs_enabled = asBool(patch.research_jobs_enabled, next.research_jobs_enabled);
    changedCount += 1;
  }
  if (patch.notifications_enabled !== undefined) {
    next.notifications_enabled = asBool(patch.notifications_enabled, next.notifications_enabled);
    changedCount += 1;
  }
  if (patch.job_max_runtime_seconds !== undefined) {
    next.job_max_runtime_seconds = clampInt(patch.job_max_runtime_seconds, 30, 3600, next.job_max_runtime_seconds);
    changedCount += 1;
  }
  if (patch.worker_max_concurrency !== undefined) {
    next.worker_max_concurrency = clampInt(patch.worker_max_concurrency, 1, 64, next.worker_max_concurrency);
    changedCount += 1;
  }
  if (patch.tenant_job_limit_active !== undefined) {
    next.tenant_job_limit_active = clampInt(patch.tenant_job_limit_active, 1, 10000, next.tenant_job_limit_active);
    changedCount += 1;
  }

  if (changedCount === 0) {
    return {
      ok: false,
      error: 'no_flags_provided',
      details: {
        writable_flags: [
          'queue_enabled',
          'ai_jobs_enabled',
          'research_jobs_enabled',
          'notifications_enabled',
          'job_max_runtime_seconds',
          'worker_max_concurrency',
          'tenant_job_limit_active',
        ],
      },
    };
  }

  const current = applyState(next);

  return {
    ok: true,
    previous,
    current,
    changed: changed(previous, current),
  };
}

export function safePauseSystem({ tenantId, disableNotifications = false } = {}) {
  const key = tenantSnapshotKey(tenantId);
  const previous = snapshot();

  LAST_PAUSE_SNAPSHOT_BY_TENANT.set(key, previous);

  const next = {
    ...previous,
    system_mode: 'maintenance',
    queue_enabled: false,
    ai_jobs_enabled: false,
    research_jobs_enabled: false,
    notifications_enabled: disableNotifications ? false : previous.notifications_enabled,
  };

  const current = applyState(next);

  return {
    ok: true,
    previous,
    current,
    changed: changed(previous, current),
    snapshot_key: key,
  };
}

export function safeResumeSystem({ tenantId } = {}) {
  const key = tenantSnapshotKey(tenantId);
  const resumeTo = LAST_PAUSE_SNAPSHOT_BY_TENANT.get(key);

  if (!resumeTo) {
    return {
      ok: false,
      error: 'no_pause_snapshot',
      details: {
        tenant_id: asText(tenantId) || null,
      },
    };
  }

  const previous = snapshot();
  const current = applyState(resumeTo);
  LAST_PAUSE_SNAPSHOT_BY_TENANT.delete(key);

  return {
    ok: true,
    previous,
    current,
    changed: changed(previous, current),
    snapshot_key: key,
  };
}

export function resetSystemControlSnapshots() {
  LAST_PAUSE_SNAPSHOT_BY_TENANT.clear();
}
