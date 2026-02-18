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

## Production env vars

In Netlify site settings, set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (required for task/notification functions)
- `OPENAI_API_KEY` (required for `/agent`)
- Optional `OPENAI_MODEL` (used by `/agent`)

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
