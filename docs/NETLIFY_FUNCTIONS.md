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
- `POST http://localhost:8888/.netlify/functions/run_scenario_pack`

## Production env vars

In Netlify site settings, set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
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
