import React from 'react';

const controlSections = [
  {
    title: 'System Mode Control',
    summary: 'development, research, production, maintenance, degraded, emergency_stop',
    phase: 'Phase 1 (Scaffolded)',
  },
  {
    title: 'Worker Controls',
    summary: 'pause, concurrency limits, quarantine placeholders',
    phase: 'Phase 1 (Schema + API stubs)',
  },
  {
    title: 'Queue Controls',
    summary: 'intake pause, depth caps, retry throttle placeholders',
    phase: 'Phase 1 (Schema + API stubs)',
  },
  {
    title: 'AI Usage Controls',
    summary: 'cache-only, fallback policy, quotas',
    phase: 'Phase 1 (Schema + API stubs)',
  },
  {
    title: 'Incident Controls',
    summary: 'open incidents + emergency stop endpoint stub',
    phase: 'Phase 1 (Scaffolded)',
  },
  {
    title: 'Audit Log',
    summary: 'control_plane_audit_log endpoint and table scaffold',
    phase: 'Phase 1 (Scaffolded)',
  },
];

const quickChecks = [
  'GET /api/control-plane/state',
  'GET /api/control-plane/flags',
  'GET /api/control-plane/incidents',
  'GET /api/control-plane/audit',
  'POST /api/control-plane/mode (write-gated)',
  'POST /api/control-plane/feature-flags/:flagKey (write-gated)',
  'POST /api/control-plane/emergency-stop (write-gated)',
];

export default function AdminControlPlanePage() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100">
      <div className="rounded-3xl border border-white/10 bg-slate-900 p-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Admin Control Plane</h1>
        <p className="mt-2 text-sm text-slate-300">
          Phase 1 scaffolding is in place. This page is intentionally lightweight and read-only in UI while backend safety
          policy is finalized.
        </p>
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          Write actions are disabled unless <code>CONTROL_PLANE_WRITE_ENABLED=true</code> in gateway runtime.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {controlSections.map((section) => (
          <div key={section.title} className="rounded-2xl border border-white/10 bg-slate-900 p-5 space-y-2">
            <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">{section.title}</h2>
            <p className="text-sm text-slate-300">{section.summary}</p>
            <p className="text-xs text-slate-500">{section.phase}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
        <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">Backend Probe Endpoints</h2>
        <ul className="mt-3 space-y-2 text-xs text-slate-300">
          {quickChecks.map((item) => (
            <li key={item} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <code>{item}</code>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900 p-5 text-xs text-slate-400 space-y-2">
        <p>
          Next step: wire this page to authenticated admin APIs and role-gated actions after control-plane table migrations are
          applied and reviewed.
        </p>
        <p>
          Safety policy remains: no live trading, no broker execution, no control-plane ownership changes away from Fastify.
        </p>
      </div>
    </div>
  );
}
