# Mac Mini Integration Plan

## Objective
Treat OpenClaw as an external operator node that integrates with existing Nexus API (Oracle), Supabase, Netlify UI, and Telegram.

## Integration Surfaces
- **Supabase**
  - Mac Mini workers write/read research + strategy pipeline tables.
  - Keep existing schemas and migration lineage unchanged.

- **Oracle Nexus API**
  - Mac Mini calls API endpoints for backend-controlled operations.
  - Oracle remains authoritative integration boundary for CRM/backend actions.

- **Telegram**
  - Outbound notifications for research/proposal events.
  - Command and approval loops remain operator-controlled.

- **Netlify UI**
  - Continues rendering control panel and system state.
  - No direct dependency on Oracle-hosted OpenClaw.

## Mac Mini Work Packages
1. **Runtime bootstrap**
   - Install Node 24 + OpenClaw.
   - Configure OpenAI/Codex auth profile.

2. **Operator profile wiring**
   - Configure model/provider defaults.
   - Set token/time budgets and retry policy.

3. **Nexus connection wiring**
   - Set `NEXUS_API_BASE_URL` (Oracle API).
   - Set Supabase credentials for server-side workers.
   - Validate Telegram bot/chat routing.

4. **Workflow verification**
   - Transcript fetch -> research artifact write.
   - Strategy generation -> ranking/proposal rows.
   - Operator notification emission.

5. **Operational hardening**
   - Add launchd/service wrapper on Mac Mini.
   - Add log rotation and restart policy.
   - Add periodic health checks and heartbeat writes.

## Acceptance Criteria
- OpenClaw runs from Mac Mini and authenticates with Codex/OpenAI profile.
- Supabase receives research/strategy outputs from Mac Mini workflows.
- Oracle API remains stable and unchanged in role (API only).
- Netlify UI continues operating with the same backend boundaries.
- No live execution path is enabled.
