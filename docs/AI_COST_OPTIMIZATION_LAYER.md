# Nexus AI Cost Optimization Layer

## Purpose
Reduce AI spend while preserving quality using a deterministic, backend-controlled route:
1. Supabase knowledge/retrieval result
2. `ai_cache`
3. local model tier
4. cheap model tier
5. premium model tier

This implementation is additive and keeps Fastify as control plane.

## Implemented Components
- Router: `gateway/src/ai/router.js`
- Cache helpers: `gateway/src/ai/cache.js`
- AI execute endpoint: `gateway/src/routes/ai_gateway.js`
- Health metrics exposure: `gateway/src/routes/system_health.js`
- Migration (already present): `supabase/migrations/20260313010300_phase6_ai_cache.sql`

## Execution Flow
1. **Knowledge short-circuit**
- If request contains `knowledge_result`, `retrieval_result`, `structured_result`, or `knowledge`, router returns that immediately unless `force_model_call=true`.
- Result status: `cache.status = bypassed_knowledge`.

2. **Cache lookup**
- Prompt is normalized and hashed.
- Router checks cache by `(provider, model, task_type, request_fingerprint)` for each provider candidate in plan order.
- On hit, returns cached payload and logs `ai_token_usage` with source `cache`.

3. **Provider execution + fallback**
- Router tries providers in ordered plan until one succeeds.
- Logs `provider_attempt` and `provider_failover` events.
- On success, stores response in `ai_cache` (unless bypassed), logs `cache_write` + `ai_token_usage`.

## Provider Plan (default)
- `nvidia_nim` (local)
- `gemini` (cheap)
- `openrouter` (cheap fallback)
- `openai` (premium)
- `heuristic`
- `stub`

Notes:
- Plan is filtered by configured env keys.
- You can request a provider explicitly (`provider`).
- You can override order with `provider_plan`/`provider_order`.
- Set `allow_fallback=false` to force a single provider.

## Cache Strategy
- Key dimensions include tenant, provider, model, task type, prompt hash, source version.
- TTL by task type:
  - `research_summary`: 24h
  - `transcript_summary`: 24h
  - `structured_extraction`: 6h
  - `opportunity_detection`: 6h
  - `assistant_conversation`: 15m
  - default: 10m

## Observability
Router emits:
- `cache_hit`
- `cache_miss`
- `cache_write`
- `provider_attempt`
- `provider_failover`
- `ai_token_usage`

System health endpoint includes cache metrics:
- `GET /api/system/health`
- `ai.cache_hit_rate_24h`
- in-memory counters from `getAiCacheMetrics()`

## Local Verification
Run tests:
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux
npm --prefix gateway run test
```

Sample execute request:
```bash
curl -s -X POST http://localhost:3000/api/ai/execute \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{
    "tenant_id":"demo-tenant",
    "task_type":"research_summary",
    "provider":"gemini",
    "prompt":"Summarize latest findings",
    "allow_fallback":true
  }' | jq
```

Knowledge short-circuit sample:
```bash
curl -s -X POST http://localhost:3000/api/ai/execute \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{
    "task_type":"research_summary",
    "knowledge_result":{"summary":"precomputed result from Supabase"}
  }' | jq
```

## Safety Boundaries
- No broker execution.
- No live trading.
- No OpenClaw deployment into Oracle.
- Backend remains policy and routing control plane.
