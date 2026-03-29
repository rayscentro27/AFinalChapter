#!/usr/bin/env node

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function parseBool(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const pair = token.slice(2);
    const eq = pair.indexOf('=');
    if (eq >= 0) {
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      args[key] = value;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[pair] = next;
      i += 1;
    } else {
      args[pair] = 'true';
    }
  }
  return args;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message, extra = null, code = 1) {
  const payload = {
    ok: false,
    error: asText(message) || 'error',
  };
  if (extra && typeof extra === 'object') payload.details = extra;
  printJson(payload);
  process.exit(code);
}

function required(value, name) {
  const text = asText(value);
  if (!text) fail(`missing_required_${name}`, {
    help: `Set ${name} in env or pass --${name.toLowerCase()}`,
  });
  return text;
}

function pickBearer(args) {
  return asText(args.bearer)
    || asText(process.env.REAL_USER_BEARER_TOKEN)
    || asText(process.env.NEXUS_BEARER_TOKEN)
    || asText(process.env.BEARER_TOKEN)
    || '';
}

function parseMaybeNumber(value, fallback = null) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

async function apiCall({ baseUrl, path, method = 'GET', apiKey, bearerToken = '', body = null }) {
  const target = `${baseUrl.replace(/\/$/, '')}${path}`;
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
  };

  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;

  const response = await fetch(target, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = {
      ok: false,
      error: 'non_json_response',
    };
  }

  return {
    status: response.status,
    ok: response.ok,
    payload,
  };
}

function usage() {
  printJson({
    ok: true,
    usage: {
      command: 'node scripts/system_control_cli.js <subcommand> [flags]',
      subcommands: [
        'diagnostics',
        'mode-set',
        'flags-update',
        'safe-pause',
        'safe-resume',
        'incident-contain',
        'incident-resume',
      ],
      required_env: [
        'INTERNAL_API_KEY',
      ],
      optional_env: [
        'SYSTEM_API_BASE_URL (default: http://127.0.0.1:3000)',
        'TENANT_ID',
        'REAL_USER_BEARER_TOKEN (or NEXUS_BEARER_TOKEN)',
      ],
      examples: [
        'node scripts/system_control_cli.js diagnostics --tenant_id=<TENANT_UUID>',
        'node scripts/system_control_cli.js safe-pause --tenant_id=<TENANT_UUID> --reason="incident"',
        'node scripts/system_control_cli.js safe-resume --tenant_id=<TENANT_UUID> --reason="resolved"',
        'node scripts/system_control_cli.js mode-set --tenant_id=<TENANT_UUID> --mode=maintenance',
        'node scripts/system_control_cli.js flags-update --tenant_id=<TENANT_UUID> --queue_enabled=false --ai_jobs_enabled=false',
      ],
    },
  });
}

function tenantIdFrom(args) {
  return asText(args.tenant_id) || asText(process.env.TENANT_ID);
}

function assertContainment(healthPayload) {
  const checks = {
    system_mode: healthPayload?.system_mode === 'maintenance',
    queue_enabled: healthPayload?.queue_enabled === false,
    ai_jobs_enabled: healthPayload?.ai_jobs_enabled === false,
    research_jobs_enabled: healthPayload?.research_jobs_enabled === false,
  };

  const failed = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([key]) => key);

  return {
    ok: failed.length === 0,
    checks,
    failed,
  };
}

async function runDiagnostics({ baseUrl, apiKey, tenantId }) {
  const query = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';

  const [health, jobs, workers, errors] = await Promise.all([
    apiCall({ baseUrl, path: '/api/system/health', method: 'GET', apiKey }),
    apiCall({ baseUrl, path: `/api/system/jobs${query}`, method: 'GET', apiKey }),
    apiCall({ baseUrl, path: '/api/system/workers', method: 'GET', apiKey }),
    apiCall({ baseUrl, path: '/api/system/errors?hours=24&limit=50', method: 'GET', apiKey }),
  ]);

  return {
    health,
    jobs,
    workers,
    errors,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const command = asText(args._[0] || 'help').toLowerCase();

  if (command === 'help' || command === '--help' || command === '-h') {
    usage();
    return;
  }

  const baseUrl = asText(args.base_url)
    || asText(process.env.SYSTEM_API_BASE_URL)
    || 'http://127.0.0.1:3000';
  const apiKey = required(asText(args.api_key) || process.env.INTERNAL_API_KEY, 'INTERNAL_API_KEY');

  if (command === 'diagnostics') {
    const diagnostics = await runDiagnostics({
      baseUrl,
      apiKey,
      tenantId: tenantIdFrom(args),
    });

    printJson({ ok: true, command, base_url: baseUrl, diagnostics });
    return;
  }

  const bearerToken = required(pickBearer(args), 'REAL_USER_BEARER_TOKEN');
  const tenantId = required(tenantIdFrom(args), 'TENANT_ID');

  if (command === 'mode-set') {
    const mode = asText(args.mode);
    if (!mode) fail('missing_mode', { valid_modes: ['development', 'research', 'production', 'maintenance'] });

    const response = await apiCall({
      baseUrl,
      path: '/api/system/mode/set',
      method: 'POST',
      apiKey,
      bearerToken,
      body: {
        tenant_id: tenantId,
        mode,
      },
    });

    printJson({ ok: response.ok, command, base_url: baseUrl, response });
    process.exit(response.ok ? 0 : 1);
    return;
  }

  if (command === 'flags-update') {
    const patch = {};

    const boolFlags = [
      'queue_enabled',
      'ai_jobs_enabled',
      'research_jobs_enabled',
      'notifications_enabled',
    ];

    for (const key of boolFlags) {
      if (args[key] !== undefined) {
        patch[key] = parseBool(args[key], null);
      }
    }

    if (args.job_max_runtime_seconds !== undefined) {
      patch.job_max_runtime_seconds = parseMaybeNumber(args.job_max_runtime_seconds, null);
    }
    if (args.worker_max_concurrency !== undefined) {
      patch.worker_max_concurrency = parseMaybeNumber(args.worker_max_concurrency, null);
    }
    if (args.tenant_job_limit_active !== undefined) {
      patch.tenant_job_limit_active = parseMaybeNumber(args.tenant_job_limit_active, null);
    }

    const response = await apiCall({
      baseUrl,
      path: '/api/system/flags/update',
      method: 'POST',
      apiKey,
      bearerToken,
      body: {
        tenant_id: tenantId,
        ...patch,
      },
    });

    printJson({ ok: response.ok, command, base_url: baseUrl, requested_patch: patch, response });
    process.exit(response.ok ? 0 : 1);
    return;
  }

  if (command === 'safe-pause' || command === 'safe-resume') {
    const path = command === 'safe-pause' ? '/api/system/safe-pause' : '/api/system/safe-resume';
    const response = await apiCall({
      baseUrl,
      path,
      method: 'POST',
      apiKey,
      bearerToken,
      body: {
        tenant_id: tenantId,
        reason: asText(args.reason) || null,
        disable_notifications: parseBool(args.disable_notifications, null),
      },
    });

    printJson({ ok: response.ok, command, base_url: baseUrl, response });
    process.exit(response.ok ? 0 : 1);
    return;
  }

  if (command === 'incident-contain') {
    const pause = await apiCall({
      baseUrl,
      path: '/api/system/safe-pause',
      method: 'POST',
      apiKey,
      bearerToken,
      body: {
        tenant_id: tenantId,
        reason: asText(args.reason) || 'incident_containment',
        disable_notifications: parseBool(args.disable_notifications, false),
      },
    });

    if (!pause.ok) {
      printJson({ ok: false, command, stage: 'pause', response: pause });
      process.exit(1);
      return;
    }

    const diagnostics = await runDiagnostics({ baseUrl, apiKey, tenantId });
    const containment = assertContainment(diagnostics.health.payload || {});

    printJson({
      ok: containment.ok,
      command,
      base_url: baseUrl,
      pause,
      diagnostics,
      containment,
    });

    process.exit(containment.ok ? 0 : 1);
    return;
  }

  if (command === 'incident-resume') {
    const resume = await apiCall({
      baseUrl,
      path: '/api/system/safe-resume',
      method: 'POST',
      apiKey,
      bearerToken,
      body: {
        tenant_id: tenantId,
        reason: asText(args.reason) || 'incident_resolved',
      },
    });

    if (!resume.ok) {
      printJson({ ok: false, command, stage: 'resume', response: resume });
      process.exit(1);
      return;
    }

    const diagnostics = await runDiagnostics({ baseUrl, apiKey, tenantId });

    printJson({
      ok: true,
      command,
      base_url: baseUrl,
      resume,
      diagnostics,
    });
    return;
  }

  fail('unknown_command', { command });
}

run().catch((error) => {
  fail('unhandled_exception', {
    message: asText(error?.message || error),
  });
});
