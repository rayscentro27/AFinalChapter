# Nexus OpenRouter Free Model Integration Strategy

Status: policy/design only. Keep OpenClaw + Comet as primary Mac Mini execution path.

## Role of OpenRouter
OpenRouter is a lightweight fallback layer, not the primary execution engine.

Primary task order:
1. Supabase knowledge retrieval
2. `ai_cache` lookup
3. OpenClaw/Comet workflow execution (when browser reasoning is required)
4. OpenRouter free-model call (only when needed)
5. Premium provider fallback only for explicit high-risk/high-value tasks

## 1) Which Workers Should Use OpenRouter

Allowed (fallback only):
- research summarization workers
- transcript distillation workers
- opportunity brief generation workers
- video content script draft generation workers

Conditional:
- CRM assistant explanation endpoints (not sensitive payloads)

## 2) Which Tasks Should Use OpenRouter

Good fit:
- concise summarization
- structured extraction from non-PII text
- rewrite/style normalization
- low-risk ideation drafts

## 3) Which Tasks Should Never Use OpenRouter

Never send:
- raw credit reports
- client PII
- secrets/tokens
- tenant boundary policy decisions
- billing/admin authorization decisions
- broker/trading execution logic

## 4) Model Router Insertion Point

Use backend-controlled router only:
- input request -> classify task/risk
- check `ai_cache`
- if miss and task is OpenRouter-eligible -> OpenRouter call
- else route to OpenClaw or approved provider
- log provider/model/token/cost metadata

## 5) Recommended OpenRouter Free Models (Policy Class)

Use model classes, not hard-coded permanent IDs:
- `openrouter_free_fast` for short summarization
- `openrouter_free_structured` for extraction
- `openrouter_free_creative` for lightweight copy ideation

Model IDs should live in env/config and be swappable without code changes.

## 6) Request Size Limits

Enforce hard caps per request:
- max input chars: 12,000
- max output chars: 6,000
- max context docs: 20
- truncation with explicit `truncated=true` metadata

## 7) Retry Limits

Retry rules:
- max retries: 2
- retry only transient errors (429/5xx/network)
- exponential backoff with jitter
- on final failure, return safe fallback response and log to `system_errors`

## 8) Rate Limiting Strategy

Global limits:
- per-worker concurrent OpenRouter calls: 1-2
- per-tenant burst cap: configurable (e.g., 20 req/5 min)
- per-day per-tenant cap by system mode

When caps hit:
- degrade to cached response
- defer low-priority tasks to queue

## 9) Caching Strategy

Use `ai_cache` with prompt normalization + hash.

Suggested TTLs:
- research summaries: 24h
- transcript summaries: 24h
- structured extraction: 6h
- opportunity detection: 6h
- assistant conversation snippets: 5-30 min

Cache safety:
- never cache sensitive raw credit/PII payloads
- store metadata for hit/miss tracking

## 10) Cost Monitoring Strategy

Track per provider/model:
- request count
- token usage
- estimated cost
- failure rate
- cache hit-rate impact

Expose through:
- `/api/system/health` (summary)
- `/api/system/usage` (detailed, recommended)

Alert when:
- free-tier fallbacks fail repeatedly
- premium provider usage exceeds budget envelope

## 11) Safe Fallback Order (When OpenClaw Fails)

1. cached response (if valid)
2. OpenRouter free model (eligible tasks only)
3. low-cost non-browser model
4. premium reasoning model (explicitly allowed tasks)
5. structured safe failure with manual-review recommendation

## 12) Non-Negotiables

- OpenRouter routing remains backend policy controlled.
- OpenRouter is optional and reversible via feature flag.
- No OpenClaw migration into Oracle control plane.
- No live trading or broker execution.
