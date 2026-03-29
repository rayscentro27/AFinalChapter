# Nexus Go-Live Day Plan (24-Hour Timeline)

## Launch Objective
Release safely with controlled volume, active monitoring, fast rollback capability, and strict operational ownership boundaries.

## T-24h (Prep)
- Freeze non-critical merges.
- Verify env completeness and secret rotation status.
- Verify health endpoints and queue diagnostics.
- Confirm incident channel + on-call ownership.

## T-4h (Staging Validation)
- Run smoke tests for auth, tenant isolation, critical read/write flows.
- Validate Control Plane reads and emergency controls.
- Confirm worker heartbeat freshness.

## T-1h (Go/No-Go)
- Confirm launch checklist complete.
- Confirm rollback commands tested.
- Set system mode and safety flags per launch policy.

## T0 (Launch)
- Enable limited public traffic.
- Keep queue throughput conservative.
- Keep optional high-risk workers gated.

## T+15m
- Check:
  - `/api/system/health`
  - `/api/system/jobs`
  - `/api/system/workers`
  - `/api/system/errors`
- Confirm no auth/RLS anomalies.

## T+1h
- Review error trends and queue depth.
- Verify no sustained dead-letter growth.
- Validate key user flows manually.

## T+4h
- Expand traffic only if SLOs stable.
- Keep change freeze for non-critical features.

## T+8h
- Run performance sanity pass.
- Check AI usage/cost drift.

## T+12h
- Review user-facing incidents and support tickets.
- Patch only critical defects.

## T+24h
- Full launch retrospective.
- Decide scale-up gates for day 2.

## Stop/Abort Conditions
- Elevated auth failure rate.
- Cross-tenant data leak suspicion.
- Queue failure storm or worker crash loop.
- Critical payment/webhook regression.

## Rollback Order
1. Disable high-risk feature flags.
2. Pause queue intake.
3. Pause selected worker classes.
4. Revert latest deploy if needed.
5. Keep read-only core flows available where possible.

## Ownership
- Windows/backend: Fastify, Supabase coordination, reporting/control endpoints.
- Mac Mini: worker/research execution only.
- No live trading, no broker execution.
