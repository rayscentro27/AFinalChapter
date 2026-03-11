# Windows Selective Commit Plan

Date: 2026-03-11
Purpose: stage backend/data/reporting changes only; avoid unrelated dirty-tree files.

## Include In This Productivity Pass

Gateway routes + scripts:
- `gateway/src/routes/research.js`
- `gateway/scripts/validate_nexus_tables.js`
- `gateway/scripts/data_integrity_check.js`
- `gateway/package.json`

Database docs + migration:
- `docs/strategy_library_registry.sql`
- `supabase/migrations/20260311114000_strategy_library_registry.sql`
- `supabase/MIGRATION_INDEX.md`

Pass documentation:
- `docs/system_events_plan.md`
- `docs/WINDOWS_PRODUCTIVITY_PASS_SUMMARY.md`
- `docs/WINDOWS_SELECTIVE_COMMIT_PLAN.md`

## Suggested Commit Split

1. Database registry migration + SQL docs
2. Research observability endpoints + scripts
3. Productivity pass docs

## Example Selective Staging

### Commit 1
```bash
git add \
  docs/strategy_library_registry.sql \
  supabase/migrations/20260311114000_strategy_library_registry.sql \
  supabase/MIGRATION_INDEX.md

git commit -m "nexus db: add strategy registry migration and docs"
```

### Commit 2
```bash
git add \
  gateway/src/routes/research.js \
  gateway/scripts/validate_nexus_tables.js \
  gateway/scripts/data_integrity_check.js \
  gateway/package.json

git commit -m "nexus gateway: add research health/debug endpoints and data checks"
```

### Commit 3
```bash
git add \
  docs/system_events_plan.md \
  docs/WINDOWS_PRODUCTIVITY_PASS_SUMMARY.md \
  docs/WINDOWS_SELECTIVE_COMMIT_PLAN.md

git commit -m "nexus docs: windows productivity pass handoff"
```

## Guardrail
Before each commit:

```bash
git status --short
```

Confirm no unrelated files are staged.
