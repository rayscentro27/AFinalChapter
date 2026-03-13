# System Events Plan

## Goal
Create a lightweight, append-only `system_events` stream for backend observability across research/risk/replay workflows.

## Proposed Event Types
- `AI_DECISION`
- `SIGNAL_BLOCKED`
- `REPLAY_COMPLETED`
- `STRATEGY_OPTIMIZED`
- `RESEARCH_ARTIFACT_ADDED`

## Proposed Table Shape (Future)

```sql
create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  tenant_id uuid,
  strategy_id text,
  symbol text,
  status text,
  severity text,
  actor text,
  source_table text,
  source_id text,
  trace_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

## Index Plan (Future)
- `(event_type, created_at desc)` for event feed filtering.
- `(tenant_id, created_at desc)` for tenant-scoped debugging.
- `(strategy_id, symbol, created_at desc)` for strategy replay/risk diagnostics.
- `(trace_id)` for request chain investigation.

## Data Retention Guidance
- Keep 30-90 days in primary table.
- Archive older records to cold storage if event volume grows.

## Usage Notes
- Events are append-only and should never mutate strategy state directly.
- This table is observability metadata, not source-of-truth for execution logic.
- Windows side can expose read-only debugging endpoints against this table in future passes.
