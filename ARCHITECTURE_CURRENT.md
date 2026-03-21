# Architecture (Current)

## System Roles
- **Mac Mini = OpenClaw + AI workforce**
  - Runs OpenClaw gateway, agent logic, prompt routing, orchestration jobs.
  - Executes transcript/research/strategy generation workflows.
  - Sends operator notifications/commands via Telegram.

- **Oracle VM = Nexus API only**
  - Hosts backend API/integration layer.
  - Owns API-side auth, data access boundaries, and CRM/backend integration endpoints.
  - Does not host OpenClaw runtime responsibilities.

- **Supabase = memory / brain**
  - Shared data plane for research artifacts, claims, strategies, rankings, approvals, and state.
  - Source of truth for research and strategy pipeline records.

- **Netlify = UI**
  - Hosts CRM and control panel frontend.
  - Hosts serverless UI-adjacent functions as needed.

## Data and Control Flow
1. Mac Mini OpenClaw workers ingest/transform data (transcripts, analysis, strategy proposals).
2. Outputs are persisted in Supabase tables.
3. Oracle Nexus API reads/writes integration-safe state and exposes backend endpoints.
4. Netlify UI reads API/Supabase views for operations dashboards and controls.
5. Telegram remains operator command/approval channel.

## Safety Guardrails
- No live trading enablement in this architecture pass.
- Signals are **proposals only** unless explicitly approved by existing safety controls.
- Service-role secrets remain server-side only.

## Explicit Non-Goals
- No new Oracle-hosted OpenClaw setup.
- No Oracle backend service rewrites in this alignment pass.
