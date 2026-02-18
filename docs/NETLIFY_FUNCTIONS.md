# Netlify Functions (Local Dev)

This repo includes a Netlify Function at `netlify/functions/agent.ts`.

## Local dev

1. Install deps:

```bash
npm install
```

2. Create local env file for Netlify dev:

- Copy `.netlify/.env.example` to `.netlify/.env`
- Fill in:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_ANON_KEY` (required for task/notification functions)
  - `ADMIN_IMPORT_TOKEN` (required for `/import_training_bundle`)
  - `OPENAI_API_KEY`
  - Optional `OPENAI_MODEL`
  - Optional `INTEL_INGEST_TOKEN` (for token-auth ingestion jobs)
  - Optional `CRON_SHARED_TOKEN` (for manual/externally-triggered overdue checks)

3. Run:

```bash
netlify dev
```

Function endpoints:

- `POST http://localhost:8888/.netlify/functions/agent`
- `POST http://localhost:8888/.netlify/functions/ingest_youtube`
- `POST http://localhost:8888/.netlify/functions/ingest_bulk`
- `POST http://localhost:8888/.netlify/functions/apply_patch`
- `POST http://localhost:8888/.netlify/functions/import_distiller`
- `POST http://localhost:8888/.netlify/functions/import_training_bundle`
- `POST http://localhost:8888/.netlify/functions/client_intake_save_and_generate_tasks`
- `GET http://localhost:8888/.netlify/functions/list_client_tasks`
- `POST http://localhost:8888/.netlify/functions/update_task_status`
- `GET http://localhost:8888/.netlify/functions/list_notifications`
- `POST http://localhost:8888/.netlify/functions/mark_notification_read`
- `POST http://localhost:8888/.netlify/functions/run_scenario_pack`
- `POST http://localhost:8888/.netlify/functions/ingest_approval_intel`
- `GET|POST http://localhost:8888/.netlify/functions/run_approval_intel_matching`
- `GET http://localhost:8888/.netlify/functions/staff_list_all_client_tasks`
- `GET http://localhost:8888/.netlify/functions/staff_list_approval_intel_matches`
- `POST http://localhost:8888/.netlify/functions/credit_report_uploaded_hook`
- `GET|POST http://localhost:8888/.netlify/functions/check_overdue_tasks`

## Production env vars

In Netlify site settings, set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (required for task/notification functions)
- `OPENAI_API_KEY` (required for `/agent`)
- Optional `OPENAI_MODEL` (used by `/agent`)
- Optional `INTEL_INGEST_TOKEN` (for non-user ingestion jobs to `/ingest_approval_intel`)
- Optional `CRON_SHARED_TOKEN` (for non-scheduled/manual calls to `/check_overdue_tasks`)

Knowledge Vault (Option 2):
- Run `docs/supabase/knowledge_vault.sql` in Supabase SQL Editor
- Run `docs/supabase/scenario_runner.sql` in Supabase SQL Editor
- Run `docs/supabase/agent_cache.sql` in Supabase SQL Editor (optional, enables /agent caching)
- Use the Distiller prompt starter in `docs/DISTILLER_PROMPT_STARTER.md`

Security note: `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to the browser (Vite `VITE_*` env vars).


Agent caching:
- Set `AGENT_CACHE_TTL_HOURS` (optional, default 72)

## Training bundle importer

This repo includes a safe, idempotent importer. It supports:

- `employees` (7 core employees)
- optional `system_agents` (system-level engines/supervisors)

- `POST http://localhost:8888/.netlify/functions/import_training_bundle`

Required env vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_IMPORT_TOKEN` (required for importer auth)

Local call example:

```bash
curl -s http://localhost:8888/.netlify/functions/import_training_bundle \
  -H 'content-type: application/json' \
  -H 'x-admin-import-token: <token>' \
  --data-binary @data/training/initial_training_bundle.json | cat
```

Verification queries:

```sql
select name, version from agents order by name;
select title from playbooks order by created_at desc limit 10;
select title, agent_name from scenario_packs order by created_at desc limit 20;
select key from nexus_config;
```


Task/notification functions require an authenticated user session (send `Authorization: Bearer <supabase_jwt>`).


## Approval Intel Pipeline

Compliant ingestion + matching (no login-bypass scraping):

1. Ingest verified approval data (manual/partner feed):

```bash
curl -s http://localhost:8888/.netlify/functions/ingest_approval_intel \
  -H 'content-type: application/json' \
  -H 'x-intel-ingest-token: <token>' \
  -d '{
    "source": "partner_feed",
    "run_match": true,
    "posts": [{
      "card_name": "Chase Ink Business Preferred",
      "source_url": "https://example.com/post/123",
      "source_post_id": "post-123",
      "fico_score": 703,
      "inquiries_6_12": 4,
      "inquiries_12_24": 8,
      "annual_income": 118000,
      "business_age_days": 14,
      "instant_approval": true,
      "credit_limit": 28000,
      "screenshot_verified": true
    }]
  }'
```

2. Manual/interactive match run (staff bearer auth):

```bash
curl -s "http://localhost:8888/.netlify/functions/run_approval_intel_matching?hours=48" \
  -H 'authorization: Bearer <supabase_jwt>'
```

3. Scheduled overdue notifier runs every 4 hours via Netlify schedule.

Useful SQL checks:

```sql
select source, card_name, fico_score, instant_approval, screenshot_verified, captured_at
from public.approval_intel_posts
order by captured_at desc
limit 20;

select tenant_id, match_score, confidence, recommended_action, matched_at
from public.approval_intel_matches
order by matched_at desc
limit 20;

select tenant_id, type, severity, title, created_at
from public.tenant_notifications
where type in ('approval_intel_match', 'task_overdue')
order by created_at desc
limit 20;
```
