# NEXUS_SECURITY_AUDIT_REPORT

## Executive Summary
- Overall risk rating: **High**
- Bottom line: Core architecture is solid (Fastify control plane, Supabase central source, layered tenant guards), but there are 3 launch-blocking gaps in webhook auth fail-open, outbound RBAC bypass via legacy send paths, and secret handling in TradingView intake.
- Top 5 security priorities:
  1. Fail closed for Matrix webhook auth when token is unset.
  2. Remove RBAC bypass path through `send_message.ts` / `send-outbox.ts` to legacy gateway routes.
  3. Stop storing TradingView shared secret in raw payload.
  4. Enforce tenant requirement for internal-key access on research read endpoints.
  5. Harden trust-proxy and header-derived IP/URL logic for rate-limit and webhook verification reliability.

## Findings (Priority Ordered)

### SEC-001
- Severity: **Critical**
- Affected files/routes:
  - `gateway/src/lib/webhooks/matrix-signature.js`
  - `gateway/src/routes/matrix.js` (`POST /webhooks/matrix`)
  - `gateway/src/env.js`
- Risk description:
  - Matrix webhook token verification is fail-open when `MATRIX_WEBHOOK_TOKEN` is unset.
- Evidence:
  - `verifyMatrixWebhookToken` returns `true` when token is empty (`matrix-signature.js:10-11`).
  - Route accepts request if verifier passes (`matrix.js:18-20`).
  - Env default for token is empty (`env.js:66`).
- Exploit scenario:
  - An unauthenticated external caller can post arbitrary Matrix webhook events and write provider-event records.
- Recommended minimal fix:
  - Make Matrix verifier fail-closed when token is not configured.
  - Also enforce startup validation requiring `MATRIX_WEBHOOK_TOKEN` in production mode.
- Required before launch: **Yes**

### SEC-002
- Severity: **High**
- Affected files/routes:
  - `netlify/functions/send_message.ts`
  - `netlify/functions/send-outbox.ts`
  - `gateway/src/routes/send.js` (`/send/sms`, `/send/whatsapp`, `/send/meta`)
  - `gateway/src/routes/outbox.js` (`/send/outbox`)
- Risk description:
  - Netlify functions authenticate user membership but do not enforce tenant permission scopes before calling gateway legacy send endpoints that only require internal API key.
- Evidence:
  - `send_message.ts` resolves membership only (`send_message.ts:114-141`) then calls `/send/*` (`send_message.ts:44-56`).
  - `send-outbox.ts` resolves membership only (`send-outbox.ts:122-149`) then calls `/send/outbox` (`send-outbox.ts:74-89`).
  - Gateway legacy send routes rely on `x-api-key` only (`send.js:15-22`, `send.js:36-37`; `outbox.js:990-991`).
- Exploit scenario:
  - Any authenticated tenant member (including low-privilege roles) may be able to send outbound messages without `messages.send` permission enforcement.
- Recommended minimal fix:
  - Route Netlify send traffic to `/messages/send` only (already guarded by `requireTenantPermission('messages.send')`), or add explicit permission checks in Netlify functions before proxying to legacy routes.
  - Mark legacy `/send/*` and `/send/outbox` as internal-only migration paths and block via feature flag once migration is complete.
- Required before launch: **Yes**

### SEC-003
- Severity: **High**
- Affected files/routes:
  - `gateway/src/routes/tradingview.js` (`POST /api/webhooks/tradingview`)
- Risk description:
  - TradingView webhook shared secret is read from payload and raw payload is persisted as-is to `tv_raw_alerts`, risking secret-at-rest exposure.
- Evidence:
  - Secret pulled from payload (`tradingview.js:86-88`).
  - Raw payload inserted directly (`tradingview.js:96`).
- Exploit scenario:
  - Anyone with database/log access to raw alerts can retrieve webhook shared secret values.
- Recommended minimal fix:
  - Redact/remove `payload.secret` before persistence.
  - Prefer secret in header instead of body for future compatibility.
- Required before launch: **Yes**

### SEC-004
- Severity: **High**
- Affected files/routes:
  - `gateway/src/routes/research.js`
  - `/api/research/*` read endpoints
- Risk description:
  - Internal API key path for research reads does not require `tenant_id`; several endpoints apply tenant filter only when tenant exists, enabling broad cross-tenant reads when omitted.
- Evidence:
  - Internal key bypass path (`research.js:133-138`).
  - Tenant filter is conditional (`research.js:341-353`, similarly across ranking/scorecard endpoints).
- Exploit scenario:
  - If internal key leaks or proxy misuse occurs, attacker/operator can enumerate cross-tenant research data unintentionally.
- Recommended minimal fix:
  - Require explicit `tenant_id` for all non-system/ops research data endpoints.
  - For true global admin views, create separate admin-only routes with explicit naming and audit logging.
- Required before launch: **Yes** (if multi-tenant privacy is strict for research data)

### SEC-005
- Severity: **Medium**
- Affected files/routes:
  - `gateway/src/index.js`
  - `gateway/src/util/request.js`
  - `gateway/src/util/rate-limit.js`
  - Webhook signature + rate-limited endpoints
- Risk description:
  - `TRUST_PROXY` defaults to true; IP and URL reconstruction rely on forwarded headers. If upstream proxy does not strictly sanitize headers, clients can spoof forwarded values, reducing rate-limit effectiveness and affecting signature URL reconstruction assumptions.
- Evidence:
  - `trustProxy: ENV.TRUST_PROXY` (`index.js:88`), default true (`env.js:21`).
  - URL reconstruction from `x-forwarded-*` (`request.js:1-14`).
  - Rate-limit key uses `req.ip`/forwarded values (`rate-limit.js:19-23`, `35`).
- Exploit scenario:
  - Header spoofing can evade per-IP rate controls and add noise to webhook verification context.
- Recommended minimal fix:
  - Restrict trusted proxy chain at deployment layer and set `TRUST_PROXY=false` unless behind a sanitized trusted proxy.
  - Normalize source IP extraction to trusted proxy semantics only.
- Required before launch: **No** (but strongly recommended before internet-scale traffic)

### SEC-006
- Severity: **Low**
- Affected files/routes:
  - `gateway/src/routes/tradingview.js` (`GET /api/webhooks/tradingview/health`)
- Risk description:
  - Unauthenticated health endpoint reveals integration posture (whether tradingview secret/supabase/oanda/telegram are configured).
- Evidence:
  - Route has no auth prehandler and returns config booleans (`tradingview.js:190-205`).
- Exploit scenario:
  - Recon endpoint helps attackers profile stack state.
- Recommended minimal fix:
  - Require internal API key, or return minimal generic health status only.
- Required before launch: **No**

### SEC-007
- Severity: **Medium**
- Affected files/routes:
  - Broad gateway query layer using `supabaseAdmin`
- Risk description:
  - Service-role key is used across gateway data paths, so tenant isolation depends entirely on route-level checks and query scoping correctness.
- Evidence:
  - `supabaseAdmin` uses service role (`gateway/src/supabase.js`).
- Exploit scenario:
  - Any missed tenant guard in a route can become cross-tenant data exposure.
- Recommended minimal fix:
  - Add a route guard checklist in PR template and lint/static checks for tenant_id enforcement on tenant-scoped tables.
  - Prioritize endpoints that accept `tenant_id` from request.
- Required before launch: **No** (architectural guardrail, but high priority process control)

### SEC-008
- Severity: **Needs verification (Medium candidate)**
- Affected files/routes:
  - `netlify/functions/deadletter-retry.ts`
- Risk description:
  - Function replays webhook dead letters after only user auth check; explicit role/tenant authorization is not in function code.
- Evidence:
  - Reads deadletter row by ID and replays to gateway (`deadletter-retry.ts`), without role check in code.
- Exploit scenario:
  - If RLS on `webhook_dead_letters` is permissive, non-admin users could trigger replay actions.
- Recommended minimal fix:
  - Add explicit role check (`owner/admin`) and tenant ownership check before replay, even if RLS exists.
- Required before launch: **Depends on RLS verification**

## Coverage Map
- Auth coverage status by route group:
  - `admin/*` routes: generally `x-api-key` + JWT tenant role/permission guard (good).
  - `api/system/*`: `x-api-key` guard only (acceptable for internal diagnostics).
  - `api/research/*`: mixed JWT/tenant-api-key/internal-key; tenant requirement inconsistent under internal-key mode.
  - Legacy send routes (`/send/*`, `/send/outbox`, `/outbox/worker`): internal key only (high-sensitivity internal surface).
- Tenant isolation coverage:
  - Strong in guarded admin routes using `requireTenantRole/Permission`.
  - Weaker in internal-key routes and any path where tenant filter is optional.
- Webhook verification coverage:
  - Twilio/Meta/WhatsApp: signature verification + idempotency present.
  - Matrix: token verification present but currently fail-open if unset.
  - TradingView: shared-secret check present, but secret is in payload and persisted raw.
- Secrets/env validation coverage:
  - Core env validation and redaction are present.
  - Some security-critical vars remain optional defaults (`MATRIX_WEBHOOK_TOKEN`).
- Logging/redaction coverage:
  - Good baseline redaction in app logger and utility helpers.
  - Gap: TradingView payload persistence can include secret before any redaction.

## Fast Safe Patches (No Broad Refactor)
1. Matrix webhook fail-closed:
   - Return `false` when token is unset in verifier.
   - Add env validation rule: require token in production mode.
2. Protect outbound send RBAC path:
   - Update Netlify send functions to use `/messages/send` path (permission-guarded) or enforce permission before proxy.
   - Disable legacy send endpoints from public proxy path.
3. TradingView secret redaction:
   - Strip `payload.secret` before insert into `tv_raw_alerts`.
4. Research tenant hard requirement:
   - Require `tenant_id` on all tenant-scoped `/api/research/*` reads, even for internal key mode.
5. Health endpoint exposure reduction:
   - Add internal key guard to `/api/webhooks/tradingview/health` or return minimal response only.
6. Proxy/rate-limit hardening:
   - Restrict `TRUST_PROXY` usage to known sanitized proxy chain.

## Launch Blockers
Must-fix before production:
- SEC-001 Matrix webhook fail-open auth
- SEC-002 Outbound RBAC bypass via legacy send proxy path
- SEC-003 TradingView secret-at-rest persistence
- SEC-004 Research tenant enforcement gap for internal-key path (if research data is tenant-private)

## 7-Day Security Hardening Plan
- Day 1:
  - Patch SEC-001 and add regression test for token-unset behavior.
- Day 2:
  - Patch SEC-003 (secret stripping) + backfill cleanup script for existing raw rows.
- Day 3:
  - Patch SEC-002 in Netlify functions; route all outbound sends through permission-guarded endpoint.
- Day 4:
  - Patch SEC-004 (mandatory tenant scope on research reads) + route tests.
- Day 5:
  - Harden proxy/IP trust settings and document production reverse-proxy assumptions.
- Day 6:
  - Audit `deadletter-retry` RLS + add explicit role check regardless of policy posture.
- Day 7:
  - Final security regression runbook execution and sign-off.

## Go / No-Go Recommendation
- **No-Go** until SEC-001, SEC-002, and SEC-003 are resolved.
- Conditional go after those fixes plus tenant-scope decision on SEC-004 and RLS verification for SEC-008.
