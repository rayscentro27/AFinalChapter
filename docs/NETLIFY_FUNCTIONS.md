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
  - `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` (required for encrypted tenant integration credentials at rest)
  - Optional `INTEGRATION_CREDENTIALS_ENCRYPTION_ACTIVE_KID` (active key id used for new writes)
  - Optional `INTEGRATION_CREDENTIALS_ENCRYPTION_KEYRING` (JSON map of key ids to secrets for rotation)
  - Optional `INTEGRATION_CREDENTIALS_ENCRYPTION_PREVIOUS_KEY` (legacy read fallback during rotation)
  - `MAILERLITE_API_KEY` (required for `/.netlify/functions/mailerlite_sync`)
  - Optional `MAILERLITE_GROUP_ID` (fallback group if client does not pass one)
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
- `POST http://localhost:8888/.netlify/functions/mailerlite_sync`
- `POST http://localhost:8888/.netlify/functions/credit_report_uploaded_hook`
- `POST http://localhost:8888/.netlify/functions/mailerlite_capture_training_task` (staff bearer auth required)
- `GET|POST http://localhost:8888/.netlify/functions/check_overdue_tasks`

## Production env vars

In Netlify site settings, set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MAILERLITE_API_KEY` (required for `/.netlify/functions/mailerlite_sync`)
- Optional `MAILERLITE_GROUP_ID` (fallback group if client does not pass one)
- `SUPABASE_ANON_KEY` (required for task/notification functions)
- `OPENAI_API_KEY` (required for `/agent`)
- `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` (required for encrypted `tenant_integrations.credentials`)
- Optional `INTEGRATION_CREDENTIALS_ENCRYPTION_ACTIVE_KID` (active key id for new encrypted envelopes)
- Optional `INTEGRATION_CREDENTIALS_ENCRYPTION_KEYRING` (JSON map for multi-key decrypt + rotation windows)
- Optional `INTEGRATION_CREDENTIALS_ENCRYPTION_PREVIOUS_KEY` (temporary read fallback while rotating keys)
- Optional `OPENAI_MODEL` (used by `/agent`)
- Optional `INTEL_INGEST_TOKEN` (for non-user ingestion jobs to `/ingest_approval_intel`)
- Optional `CRON_SHARED_TOKEN` (for non-scheduled/manual calls to `/check_overdue_tasks`)

`POST /.netlify/functions/mailerlite_capture_training_task` requires a staff bearer token and writes to `knowledge_docs`, `playbooks`, `prompt_patches`, and optional `client_tasks`.

Knowledge Vault (Option 2):
- Run `docs/supabase/knowledge_vault.sql` in Supabase SQL Editor
- Run `docs/supabase/scenario_runner.sql` in Supabase SQL Editor
- Run `docs/supabase/agent_cache.sql` in Supabase SQL Editor (optional, enables /agent caching)
- Use the Distiller prompt starter in `docs/DISTILLER_PROMPT_STARTER.md`

Security note: `SUPABASE_SERVICE_ROLE_KEY`, `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY`, `INTEGRATION_CREDENTIALS_ENCRYPTION_KEYRING`, and `INTEGRATION_CREDENTIALS_ENCRYPTION_PREVIOUS_KEY` must never be exposed to the browser (Vite `VITE_*` env vars).

Rotation runbook: see `docs/INTEGRATION_CREDENTIALS_KEY_ROTATION.md` for no-downtime key rollout and rollback steps.


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



## MailerLite sync -> task + employee training

Use this endpoint to convert sync notes into: a follow-up client task + training artifacts for AI employees.

`POST /.netlify/functions/mailerlite_capture_training_task`

Headers:
- `Authorization: Bearer <supabase_jwt>`
- `Content-Type: application/json`

Body example:

```json
{
  "tenant_id": "<optional-tenant-uuid>",
  "training_title": "MailerLite Sync Training 2026-02-18",
  "additional_info": "Prioritize retry of failed contacts, tighten compliance language, and escalate stale leads after 48h.",
  "employee_targets": ["Nexus Founder", "Nexus Analyst", "Sentinel Scout"],
  "create_task": true,
  "auto_apply_patches": true,
  "task": {
    "title": "Review MailerLite sync outcomes and apply training patch",
    "type": "education",
    "signal": "yellow"
  },
  "sync_summary": {
    "total": 120,
    "successful": 111,
    "failed": 9
  }
}
```
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

## Outbound inbox send proxy

Endpoints:
- `POST /.netlify/functions/send-sms`
- `POST /.netlify/functions/send-whatsapp`
- `POST /.netlify/functions/send-meta`
- `POST /.netlify/functions/send_message` (backward-compatible)

Required Netlify env vars:
- `ORACLE_BASE_URL` (preferred; ex: `https://api.yourdomain.com`)
- `ORACLE_INTERNAL_API_KEY` (preferred; must match Oracle gateway `INTERNAL_API_KEY`)
- `GATEWAY_BASE_URL` (legacy fallback)
- `GATEWAY_INTERNAL_API_KEY` (legacy fallback)

Auth:
- Requires `Authorization: Bearer <supabase_jwt>`
- Tenant is resolved from tenant memberships; requested `tenant_id` must belong to caller

Body:
```json
{
  "tenant_id": "optional-uuid",
  "conversation_id": "uuid",
  "provider": "sms|whatsapp|meta",
  "text": "message body",
  "to": "+15551234567",
  "recipient_id": "PSID_OR_IGSID"
}
```

Provider field mapping:
- `sms`: requires `to`
- `whatsapp`: requires `to`
- `meta`: requires `recipient_id`

This function validates conversation + channel ownership and forwards to Oracle `/send/*` using `x-api-key`.

## Monitoring + alerting proxies

Endpoints:
- `GET /.netlify/functions/admin-alerts?tenant_id=<uuid>&status=open|resolved&limit=100`
- `POST /.netlify/functions/admin-alerts-run`
- `GET /.netlify/functions/admin-alerts-notifications?tenant_id=<uuid>&limit=100`

Body for `admin-alerts-run`:
```json
{
  "tenant_id": "<uuid>",
  "notify": true
}
```

Required Netlify env vars (already used by other Oracle proxies):
- `ORACLE_API_BASE_URL` (or `ORACLE_BASE_URL`)
- `ORACLE_API_KEY` (or `ORACLE_INTERNAL_API_KEY`)

Auth:
- Requires `Authorization: Bearer <supabase_jwt>`
- Gateway enforces tenant RBAC and logs redacted payloads
