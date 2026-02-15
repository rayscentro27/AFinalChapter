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
- `POST http://localhost:8888/.netlify/functions/apply_patch`

## Production env vars

In Netlify site settings, set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (required for `/agent`)
- Optional `OPENAI_MODEL` (used by `/agent`)

Knowledge Vault (Option 2):
- Run `docs/supabase/knowledge_vault.sql` in Supabase SQL Editor
- Use the Distiller prompt starter in `docs/DISTILLER_PROMPT_STARTER.md`

Security note: `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to the browser (Vite `VITE_*` env vars).
