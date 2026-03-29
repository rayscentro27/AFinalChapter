# Mac Mini OpenClaw Migration Plan

## New Architecture (Authoritative)
- **Mac Mini**: runs OpenClaw, AI employees, prompt routing, operator workflows.
- **Oracle VM**: runs Nexus API/backend only (Fastify/Nginx/system integrations already in place).
- **Supabase**: source of truth for research brain, strategy library, ranking, approvals, and execution records.
- **Telegram (Nexus Tele)**: operator command/approval channel.
- **Trading mode**: no live trading. Signals are proposals only.

## Scope Boundaries
- Do not continue Oracle-VM OpenClaw install or service maintenance.
- Do not modify existing Oracle backend services in this migration pass.
- Keep API contracts stable between Mac Mini agents and Nexus API.

## Data/Control Flow
1. OpenClaw workers on Mac Mini ingest transcripts and build artifacts.
2. Mac Mini writes research/strategy outputs into Supabase.
3. Oracle Nexus API continues to expose integration endpoints for CRM and operational systems.
4. Telegram remains operator-facing for approvals/status.
5. Execution remains blocked from live mode; signals remain advisory/proposal state.

## Security Posture
- Keep service-role keys server-side only.
- Keep AI provider auth on Mac Mini only.
- Do not expose OpenClaw gateway publicly.
- Use outbound integration from Mac Mini to Nexus API/Supabase/Telegram.

## Migration Steps
1. Freeze Oracle OpenClaw path (completed by architecture decision).
2. Stand up clean OpenClaw runtime on Mac Mini.
3. Rebind AI workflows to Mac Mini environment variables and auth profile.
4. Repoint operational docs and runbooks from Oracle-OpenClaw assumptions to Mac Mini.
5. Validate end-to-end pipeline:
   - transcript -> research artifact -> strategy -> ranking -> proposal signals.
6. Keep Oracle API unchanged except standard integration compatibility testing.

## Rollback / Contingency
- If Mac Mini setup is incomplete, keep existing backend-only Oracle path running unchanged.
- No production dependency should require Oracle-hosted OpenClaw after this cutover.

## Acceptance Criteria
- OpenClaw authentication and model routing work on Mac Mini.
- Mac Mini can write research artifacts to Supabase.
- Strategy generation and ranking complete without Oracle-hosted OpenClaw.
- Telegram operator notifications/commands function.
- No live order execution is enabled.
