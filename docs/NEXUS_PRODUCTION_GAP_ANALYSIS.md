# Nexus Production Launch Gap Analysis

## Executive Summary
Nexus is close to production-ready on architecture and safety direction, but still has concrete launch gaps in control-plane table activation, auth hardening completion, operations discipline, and external service runbooks.

Readiness score: **78/100**

## What Is Strong
- Clear architecture boundaries (Netlify frontend, Fastify control plane, Supabase SoT, Mac Mini workers).
- Queue/safety flags and system endpoints scaffolded.
- Security and control-plane design docs in place.
- AI-cost strategy documented with cache/router approach.

## Critical Gaps
1. Control-plane schema not applied in active environment.
2. Control-plane writes disabled (`CONTROL_PLANE_WRITE_ENABLED=false`) in current runtime.
3. Unrelated dirty worktree increases release risk.
4. Some integrations depend on manual secrets handling (token hygiene risk).
5. Incident runbooks exist but drill evidence incomplete.

## Important Improvements
- Complete migration verification path per environment.
- Standardize secret management sync (Doppler/Supabase/Netlify/Oracle).
- Enforce release branch hygiene and selective deploy policy.
- Add recurring game-day simulation schedule.

## Operational Checklist
- [ ] Control-plane tables verified in target Supabase.
- [ ] Auth + role + permission checks smoke-tested on admin endpoints.
- [ ] Queue dead-letter and stale worker alerts validated.
- [ ] Backup/restore drill completed in last 30 days.
- [ ] Launch-day rollback drill rehearsed.
