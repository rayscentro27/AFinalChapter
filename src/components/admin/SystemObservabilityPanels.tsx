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

export default function SystemObservabilityPanels({ payload }: Props) {
  const panels = payload?.panels || {};
  const jobs = panels.jobs?.data || {};
  const workers = panels.workers?.data || {};
  const errors = panels.errors?.data || {};
  const usage = panels.usage?.data || {};

  const metricCards = useMemo(() => [
    { label: 'Queue Pending', value: asNumber(jobs?.summary?.pending_count, 0) },
    { label: 'Queue Dead Letter', value: asNumber(jobs?.summary?.dead_letter_count, 0) },
    { label: 'Workers Fresh', value: asNumber(workers?.summary?.fresh_count, 0) },
    { label: 'Workers Stale', value: asNumber(workers?.summary?.stale_count, 0) },
    { label: 'Errors (Window)', value: asNumber(errors?.summary?.total_errors, 0) },
    { label: 'AI Requests (24h)', value: asNumber(usage?.ai_requests_24h, 0) },
    { label: 'AI Failures (24h)', value: asNumber(usage?.ai_failures_24h, 0) },
    { label: 'Cache Hit Rate', value: asPercent(usage?.ai_cache_hit_rate_24h) },
    { label: 'Token Usage', value: asNumber(usage?.token_usage_24h, 0) },
    { label: 'Cost USD (24h)', value: asNumber(usage?.cost_estimate_24h_usd, 0).toFixed(4) },
  ], [jobs, workers, errors, usage]);

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
