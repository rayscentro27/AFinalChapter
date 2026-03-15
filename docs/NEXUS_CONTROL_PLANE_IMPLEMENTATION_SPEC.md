# Nexus Control Plane Implementation Spec

## Scope
Implementation-ready, additive plan for the existing Nexus stack.
- No architecture rewrite.
- No infrastructure replacement.
- Supabase remains source of truth.
- Fastify remains control plane.

## 1. Database Schema Plan
Draft migration set:
1. `control_plane_core`
   - `system_config`
   - `feature_flags`
2. `control_plane_worker_queue_controls`
   - `worker_controls`
   - `queue_controls`
3. `control_plane_ai_limits`
   - `ai_usage_limits`
4. `control_plane_incident_audit`
   - `incident_events`
   - `control_plane_audit_log`

Core DDL shape (abbreviated):
- Use `uuid` PK + `created_at/updated_at` timestamps.
- Add indexes on `scope/scope_id`, `worker_type`, `job_type`, `flag_key`, `created_at`.
- Add `check` constraints for enumerated modes/states where stable.

## 2. RLS Considerations
- Read access:
  - `superadmin` and allowed ops roles can read all control tables.
  - tenant admins can only read tenant-scoped rows where applicable.
- Write access:
  - only server-side admin routes (service role) or restricted RPC.
- `control_plane_audit_log`:
  - append-only; no updates/deletes outside break-glass role.

## 3. Fastify API Contracts
New route group: `gateway/src/routes/control_plane.js`

Read endpoints:
- `GET /api/control-plane/state`
- `GET /api/control-plane/flags`
- `GET /api/control-plane/workers`
- `GET /api/control-plane/queues`
- `GET /api/control-plane/incidents`
- `GET /api/control-plane/audit?limit=&cursor=`

Write endpoints:
- `POST /api/control-plane/mode`
- `POST /api/control-plane/feature-flags/:flagKey`
- `POST /api/control-plane/workers/pause`
- `POST /api/control-plane/queues/pause`
- `POST /api/control-plane/ai-limits`
- `POST /api/control-plane/incidents/open`
- `POST /api/control-plane/incidents/:id/resolve`
- `POST /api/control-plane/emergency-stop`

Auth/guard model:
- existing auth guard + role enforcement.
- dangerous actions require `reason` and confirmation token.

## 4. Integration with Existing System Endpoints
Existing endpoints in `gateway/src/routes/system_health.js` remain primary runtime diagnostics:
- `/api/system/health`
- `/api/system/workers`
- `/api/system/jobs`
- `/api/system/errors`

Add control-plane summary into `/api/system/health` payload:
- `effective_system_mode`
- `queue_intake_paused`
- `ai_fallback_allowed`
- `active_incident_count`

## 5. Worker Polling Logic
Files:
- extend `gateway/src/queue/workerLoop.js`
- add `gateway/src/queue/controlPlaneClient.js`

Behavior:
1. Poll effective settings every 10-15s.
2. Cache for 30s.
3. Apply max concurrency and job-type disables before claim cycle.
4. On `emergency_stop`: stop claim loop, heartbeat status=`paused_emergency`.

## 6. Feature Flag Flow
Resolution precedence:
1. Global hard stop.
2. Global flag.
3. Tenant flag.
4. Worker/job override.

Flag evaluation helper:
- `gateway/src/lib/featureFlags.js`
- deterministic decision logging with `flag_key`, `scope`, `result`.

## 7. Queue Throttle Flow
At claim time:
- read queue controls by `job_type`.
- if `intake_paused=true`, skip job type.
- if depth cap exceeded, do not claim new rows.
- apply retry multiplier and max attempts override.

## 8. Emergency Stop Flow
Sequence:
1. write `system_mode=emergency_stop` + incident row.
2. set queue intake paused globally.
3. disable AI/research jobs.
4. workers observe within poll interval and stop new claims.
5. require explicit recovery action to leave emergency state.

## 9. Audit Logging Design
Every write endpoint logs:
- actor user id/role
- action
- target
- reason
- before/after state
- request id

Retention:
- keep full history in `control_plane_audit_log`.
- add archive strategy later if needed.

## 10. Testing and Simulation Controls
API additions:
- `POST /api/control-plane/simulations/user`
- `POST /api/control-plane/simulations/load`
- `POST /api/control-plane/simulations/chaos`
- `POST /api/control-plane/simulations/:id/stop`

Safety:
- simulation namespace/test tenant only.
- hard caps on generated volume.
- auto-timeout and stop on threshold violations.

## 11. Rollout Plan
Phase 1:
- tables, RLS, read endpoints, audit logging.

Phase 2:
- write endpoints for mode/flags/worker/queue controls.

Phase 3:
- worker enforcement + emergency stop + UI controls.

Phase 4:
- simulation jobs + dashboard reports.

## 12. Operational Commands
Validation (local):
```bash
cd gateway
npm run start
curl -s -H "x-api-key: $INTERNAL_API_KEY" http://127.0.0.1:3000/api/system/health | jq
```

After migrations are authored and approved:
```bash
supabase db push
```
