import React, { useMemo } from 'react';

type Panel = {
  ok: boolean;
  status: number;
  data: any;
  error: string | null;
};

export type SystemObservabilityPayload = {
  ok: boolean;
  tenant_id?: string;
  hours?: number;
  warnings?: string[];
  panels?: {
    health?: Panel;
    jobs?: Panel;
    workers?: Panel;
    errors?: Panel;
    usage?: Panel;
    ingestion?: Panel;
    opportunities?: Panel;
    video_worker?: Panel;
  };
};

type Props = {
  payload: SystemObservabilityPayload | null;
};

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asPercent(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  return `${(n * 100).toFixed(1)}%`;
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function entriesOfMap(input: unknown): Array<{ key: string; value: number }> {
  if (!input || typeof input !== 'object') return [];
  return Object.entries(input as Record<string, unknown>)
    .map(([key, value]) => ({ key, value: asNumber(value, 0) }))
    .sort((a, b) => b.value - a.value);
}

function renderMapRows(input: unknown, emptyText: string) {
  const rows = entriesOfMap(input);
  if (!rows.length) return <div className="text-xs text-slate-400">{emptyText}</div>;

  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between text-xs">
          <span className="text-slate-300">{row.key}</span>
          <span className="text-slate-100 font-semibold">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function toneForHealth(ok: boolean) {
  return ok
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : 'border-red-500/30 bg-red-500/10 text-red-200';
}

export default function SystemObservabilityPanels({ payload }: Props) {
  const panels = payload?.panels || {};
  const health = panels.health?.data || {};
  const jobs = panels.jobs?.data || {};
  const workers = panels.workers?.data || {};
  const errors = panels.errors?.data || {};
  const usage = panels.usage?.data || {};
  const apiLatency = health?.api_latency || {};

  const slowestRoutes = Array.isArray(apiLatency?.slowest_routes) ? apiLatency.slowest_routes.slice(0, 5) : [];
  const workerRows = Array.isArray(workers?.workers) ? workers.workers.slice(0, 8) : [];
  const jobRows = Array.isArray(jobs?.jobs) ? jobs.jobs.slice(0, 8) : [];
  const errorRows = Array.isArray(errors?.errors) ? errors.errors.slice(0, 8) : [];
  const topFailingJobTypes = Array.isArray(errors?.summary?.top_failing_job_types) ? errors.summary.top_failing_job_types : [];

  const metricCards = useMemo(() => [
    { label: 'Queue Pending', value: asNumber(jobs?.summary?.pending_count, 0) },
    { label: 'Queue Dead Letter', value: asNumber(jobs?.summary?.dead_letter_count, 0) },
    { label: 'Workers Fresh', value: asNumber(workers?.summary?.fresh_count, 0) },
    { label: 'Workers Stale', value: asNumber(workers?.summary?.stale_count, 0) },
    { label: 'Errors (Window)', value: asNumber(errors?.summary?.total_errors, 0) },
    { label: 'API Avg ms', value: asNumber(apiLatency?.avg_ms, 0).toFixed(1) },
    { label: 'API p95 ms', value: asNumber(apiLatency?.p95_ms, 0).toFixed(1) },
    { label: 'AI Requests (24h)', value: asNumber(usage?.ai_requests_24h, 0) },
    { label: 'AI Failures (24h)', value: asNumber(usage?.ai_failures_24h, 0) },
    { label: 'Cache Hit Rate', value: asPercent(usage?.ai_cache_hit_rate_24h) },
    { label: 'Token Usage', value: asNumber(usage?.token_usage_24h, 0) },
    { label: 'Cost USD (24h)', value: asNumber(usage?.cost_estimate_24h_usd, 0).toFixed(4) },
  ], [apiLatency, jobs, workers, errors, usage]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">System Observability Panels</h2>
          <span className="text-xs text-slate-400">Read-only via system endpoints</span>
        </div>

        {!payload ? (
          <div className="mt-4 text-sm text-slate-400">No system observability data loaded yet.</div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              {metricCards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="text-[11px] uppercase tracking-widest text-slate-400 font-black">{card.label}</div>
                  <div className="mt-2 text-lg font-black text-slate-100">{card.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-black mb-2">Queue Status Counts</h3>
                {renderMapRows(jobs?.summary?.status_counts, 'No queue status data.')}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-black mb-2">AI Provider Counts</h3>
                {renderMapRows(usage?.summary?.provider_counts, 'No provider usage data.')}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-black mb-2">AI Task Type Counts</h3>
                {renderMapRows(usage?.summary?.task_type_counts, 'No task usage data.')}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-black mb-2">Gateway API Latency</h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                    <div className="text-slate-400">Avg</div>
                    <div className="mt-1 text-lg font-black text-slate-100">{asNumber(apiLatency?.avg_ms, 0).toFixed(1)}ms</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                    <div className="text-slate-400">p95</div>
                    <div className="mt-1 text-lg font-black text-slate-100">{asNumber(apiLatency?.p95_ms, 0).toFixed(1)}ms</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                    <div className="text-slate-400">p99</div>
                    <div className="mt-1 text-lg font-black text-slate-100">{asNumber(apiLatency?.p99_ms, 0).toFixed(1)}ms</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-400">
                  Last {asNumber(apiLatency?.sample_window_minutes, 60)} minutes, {asNumber(apiLatency?.total_requests, 0)} requests, error rate {asPercent(apiLatency?.error_rate)}.
                </div>
                <div className="mt-3 space-y-2">
                  {slowestRoutes.length === 0 ? (
                    <div className="text-xs text-slate-400">No latency samples captured yet.</div>
                  ) : slowestRoutes.map((route) => (
                    <div key={`${route.method}:${route.route}`} className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-100">{route.method} {route.route}</span>
                        <span className={`rounded-full border px-2 py-0.5 ${toneForHealth(asNumber(route.error_rate, 0) < 0.05)}`}>{asPercent(route.error_rate)} errors</span>
                      </div>
                      <div className="mt-2 text-slate-400">avg {asNumber(route.avg_ms, 0).toFixed(1)}ms · p95 {asNumber(route.p95_ms, 0).toFixed(1)}ms · {asNumber(route.count, 0)} req</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-black mb-2">Mac Mini Worker Status</h3>
                <div className="space-y-2">
                  {workerRows.length === 0 ? (
                    <div className="text-xs text-slate-400">No worker heartbeat rows returned.</div>
                  ) : workerRows.map((worker: any) => (
                    <div key={String(worker.worker_id)} className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-100">{String(worker.worker_id || 'unknown-worker')}</span>
                        <span className={`rounded-full border px-2 py-0.5 ${toneForHealth(String(worker.status || '').toLowerCase() !== 'stale')}`}>{String(worker.status || 'unknown')}</span>
                      </div>
                      <div className="mt-2 text-slate-400">type {String(worker.worker_type || 'n/a')} · in-flight {asNumber(worker.in_flight_jobs, 0)} / {asNumber(worker.max_concurrency, 0)}</div>
                      <div className="mt-1 text-slate-500">last seen {worker.last_seen_at ? new Date(worker.last_seen_at).toLocaleString() : 'n/a'}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-black mb-2">Queue Backlog + Failures</h3>
                <div className="space-y-2">
                  {jobRows.length === 0 ? (
                    <div className="text-xs text-slate-400">No queue rows returned.</div>
                  ) : jobRows.map((job: any) => (
                    <div key={String(job.id)} className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-100">{String(job.job_type || 'unknown_job')}</span>
                        <span className={`rounded-full border px-2 py-0.5 ${toneForHealth(!['failed', 'dead_letter'].includes(String(job.status || '').toLowerCase()))}`}>{String(job.status || 'unknown')}</span>
                      </div>
                      <div className="mt-2 text-slate-400">attempts {asNumber(job.attempt_count, 0)} / {asNumber(job.max_attempts, 0)} · priority {asNumber(job.priority, 0)}</div>
                      {job.last_error ? <div className="mt-1 text-red-300">{String(job.last_error)}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-black mb-2">Top Failing Job Types</h3>
                {topFailingJobTypes.length === 0 ? (
                  <div className="text-xs text-slate-400">No failing job types in the current error window.</div>
                ) : (
                  <div className="space-y-2">
                    {topFailingJobTypes.map((row: any) => (
                      <div key={String(row.job_type)} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-xs">
                        <span className="text-slate-200">{String(row.job_type || 'unknown')}</span>
                        <span className="font-semibold text-red-200">{asNumber(row.count, 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-black mb-2">Recent Error Alerts</h3>
                {errorRows.length === 0 ? (
                  <div className="text-xs text-slate-400">No recent system errors returned.</div>
                ) : (
                  <div className="space-y-2">
                    {errorRows.map((row: any) => (
                      <div key={String(row.id)} className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-100">{String(row.service || 'unknown_service')} / {String(row.component || 'unknown_component')}</span>
                          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-200">{String(row.error_type || 'error')}</span>
                        </div>
                        <div className="mt-2 text-slate-300">{String(row.error_message || 'unknown_error')}</div>
                        <div className="mt-1 text-slate-500">{row.created_at ? new Date(row.created_at).toLocaleString() : 'n/a'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {(payload.warnings || []).length > 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="text-xs uppercase tracking-widest font-black text-amber-200 mb-2">Panel Warnings</div>
                <ul className="text-xs text-amber-100 space-y-1">
                  {(payload.warnings || []).map((warning) => (
                    <li key={warning}>{asText(warning)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
