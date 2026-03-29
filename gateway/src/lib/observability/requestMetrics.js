const MAX_RECENT_SAMPLES = 5000;
const recentSamples = [];

function asText(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function percentile(values, ratio) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
  return Number(sorted[index] || 0);
}

export function recordRequestMetric(input = {}) {
  const sample = {
    at: new Date().toISOString(),
    route: asText(input.route) || 'unknown_route',
    method: asText(input.method) || 'GET',
    tenant_id: asText(input.tenant_id) || null,
    provider: asText(input.provider) || null,
    status_code: asNumber(input.status_code, 0),
    ms: Number(asNumber(input.ms, 0).toFixed(2)),
  };

  recentSamples.push(sample);
  if (recentSamples.length > MAX_RECENT_SAMPLES) {
    recentSamples.splice(0, recentSamples.length - MAX_RECENT_SAMPLES);
  }

  return sample;
}

export function getRequestLatencySnapshot(options = {}) {
  const windowMinutes = Math.max(1, Math.min(24 * 60, asNumber(options.window_minutes, 60)));
  const top = Math.max(1, Math.min(20, asNumber(options.top, 5)));
  const sinceMs = Date.now() - (windowMinutes * 60 * 1000);

  const windowed = recentSamples.filter((sample) => new Date(sample.at).getTime() >= sinceMs);
  const latencies = windowed.map((sample) => asNumber(sample.ms, 0)).filter((value) => value >= 0);
  const errorRequests = windowed.filter((sample) => asNumber(sample.status_code, 0) >= 500).length;

  const routeStats = new Map();
  for (const sample of windowed) {
    const routeKey = `${sample.method} ${sample.route}`;
    const existing = routeStats.get(routeKey) || {
      route: sample.route,
      method: sample.method,
      count: 0,
      errors: 0,
      latencies: [],
      latest_at: sample.at,
    };
    existing.count += 1;
    if (asNumber(sample.status_code, 0) >= 500) existing.errors += 1;
    existing.latencies.push(asNumber(sample.ms, 0));
    existing.latest_at = sample.at > existing.latest_at ? sample.at : existing.latest_at;
    routeStats.set(routeKey, existing);
  }

  const slowestRoutes = Array.from(routeStats.values())
    .map((entry) => {
      const average = entry.count > 0
        ? entry.latencies.reduce((sum, value) => sum + value, 0) / entry.count
        : 0;
      return {
        route: entry.route,
        method: entry.method,
        count: entry.count,
        error_count: entry.errors,
        error_rate: entry.count > 0 ? Number((entry.errors / entry.count).toFixed(4)) : 0,
        avg_ms: Number(average.toFixed(2)),
        p95_ms: Number(percentile(entry.latencies, 0.95).toFixed(2)),
        latest_at: entry.latest_at,
      };
    })
    .sort((a, b) => {
      if (b.p95_ms !== a.p95_ms) return b.p95_ms - a.p95_ms;
      return b.count - a.count;
    })
    .slice(0, top);

  return {
    ok: true,
    sample_window_minutes: windowMinutes,
    total_requests: windowed.length,
    error_requests: errorRequests,
    error_rate: windowed.length > 0 ? Number((errorRequests / windowed.length).toFixed(4)) : 0,
    avg_ms: latencies.length > 0 ? Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(2)) : 0,
    p95_ms: Number(percentile(latencies, 0.95).toFixed(2)),
    p99_ms: Number(percentile(latencies, 0.99).toFixed(2)),
    slowest_routes: slowestRoutes,
  };
}