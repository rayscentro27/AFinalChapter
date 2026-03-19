# Portal Messaging Merge Readiness Checklist

Last updated: 2026-03-19
Branch checkpoint: `feat/contact-merge-auto-merge` at `5314c0d`

## 1) Required Supabase Migrations

Run all pending migrations in timestamp order.

Minimum required for this messaging rollout:

1. `20260223152000_unified_inbox_uuid.sql`
2. `20260318190000_portal_messaging_phase123.sql`
3. `20260319110000_comms_provider_retirement_and_credit_intel_optin.sql`

Validation SQL:

```sql
-- Core messaging tables/features
select to_regclass('public.conversation_user_participants') as conversation_user_participants;
select to_regclass('public.message_reads') as message_reads;
select to_regclass('public.message_notification_preferences') as message_notification_preferences;
select to_regclass('public.message_notification_log') as message_notification_log;

-- Credit-intel opt-in alignment
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'client_alert_prefs'
  and column_name in ('portal_message_opt_in', 'email_opt_in', 'sms_opt_in')
order by column_name;
```

## 2) Storage + Attachment Security

Messaging attachment flow depends on bucket `attachments` and gateway routes:

- `POST /attachments/upload`
- `GET /attachments/:tenant_id/:attachment_id/signed-url`

Verify in Supabase Storage:

1. Bucket `attachments` exists.
2. Bucket visibility is **private**.
3. Objects are written under tenant-prefixed paths: `tenant/<tenant_id>/...`.

Server-side protections now enforced in gateway:

- message, conversation, contact linkage is tenant-scoped and consistency-checked
- signed URL generation rejects tenant/path mismatch for tenant-prefixed objects
- MIME/type and max size checks are enforced before upload

## 3) Environment / Secrets

### Netlify Functions

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (or `VITE_SUPABASE_ANON_KEY`)
- Oracle proxy pair (one of these):
  - `ORACLE_API_BASE_URL` + `ORACLE_API_KEY`
  - `ORACLE_BASE_URL` + `ORACLE_INTERNAL_API_KEY`
  - `GATEWAY_BASE_URL` + `GATEWAY_INTERNAL_API_KEY`

Used for messaging email notifications:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (or `VITE_SUPABASE_ANON_KEY`)

### Gateway (Oracle API)

Required:

- `INTERNAL_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `META_PAGE_ACCESS_TOKEN`

### Retired channel cleanup

Confirm old secrets are removed after deploy verification:

- any `TWILIO_*`
- any `WHATSAPP_*`

## 4) Manual Smoke Tests (Post-Deploy)

Run these in order:

1. Open Unified Inbox, select an existing routed thread.
2. Send plain-text message; confirm outbox/message status updates.
3. Upload attachment; confirm chip appears before send.
4. Send message with attachment only; confirm send succeeds.
5. Open attachment chip from message history; confirm signed URL opens.
6. Verify unread badge increments on inbound and clears on thread open.
7. Verify assignment controls still update thread assignment.
8. Verify participant notification email path for non-sender participants.

Negative/security checks:

1. Attempt mismatched `message_id` + `conversation_id` upload (should fail).
2. Attempt mismatched `contact_id` + conversation upload (should fail).
3. Attempt cross-tenant message id upload (should fail).
4. Attempt signed URL for attachment under another tenant (should fail).

## 5) Retired Channel Enforcement Checks

Expect inserts/updates with retired values to fail in active tables:

- `channel_accounts`
- `provider_events`
- `outbox_messages`
- `message_delivery_events`
- `conversation_participants`
- `tenant_integrations`
- `tenant_channel_pools`
- `tenant_on_call`
- `conversations`
- `credit_intel_matches`

Quick check (app/runtime tree):

```bash
rg -n "twilio|whatsapp|\\bsms\\b|sms_opt_in|TWILIO_|WHATSAPP_" \
  src netlify/functions gateway/src lib components adapters services scripts \
  --glob '!**/*.sql' --glob '!**/*.md' --glob '!**/*.json'
```

Expected result: no active runtime matches.

## 6) Verification Commands

```bash
npm run build
npm --prefix gateway run test
```

Current expected baseline after hardening:

- build: pass
- gateway tests: pass (`19/19`)

## 7) Known Limitations / Deferred

- Historical SQL/migration files still contain legacy Twilio/WhatsApp/SMS strings for audit/history compatibility; this is expected.
- Attachment gateway routes are privileged server routes. If client-self-service attachment flows are required outside staff inbox paths, add a dedicated client-safe endpoint instead of widening current staff guards.
