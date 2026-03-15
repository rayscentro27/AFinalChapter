# Nexus Content Engine Implementation Spec (Supabase + Queue)

## Scope
Implementation-ready schema and job model for transcript-to-video content generation. Additive only; no architecture rewrite.

## 1) Tables

### `content_opportunities`
Purpose: normalized candidate ideas derived from transcripts/research.
Columns:
- `id uuid pk default gen_random_uuid()`
- `tenant_id uuid not null`
- `opportunity_key text not null` (dedupe key)
- `source_type text not null` (`transcript`, `research_claim`, `cluster`)
- `source_ref_id text not null`
- `topic text not null`
- `content_bucket text not null`
- `platform_targets text[] not null default '{}'`
- `angle_type text not null`
- `score numeric(5,2) not null default 0`
- `quality_score numeric(5,2) not null default 0`
- `platform_fit_score jsonb not null default '{}'::jsonb`
- `status text not null default 'draft'`
- `cooldown_until timestamptz null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:
- `(tenant_id, status, created_at desc)`
- `(tenant_id, content_bucket, score desc)`
- unique `(tenant_id, opportunity_key)`

### `content_scripts`
Purpose: generated scripts tied to opportunities.
Columns:
- `id uuid pk`
- `tenant_id uuid not null`
- `opportunity_id uuid not null references content_opportunities(id) on delete cascade`
- `platform text not null`
- `variant_key text not null`
- `hook text not null`
- `script_body text not null`
- `cta_text text null`
- `status text not null default 'draft'`
- `model_metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Indexes:
- `(tenant_id, opportunity_id, platform)`
- `(tenant_id, status, created_at desc)`

### `content_assets`
Purpose: captions/thumbnails/outlines/calendar artifacts.
Columns:
- `id uuid pk`
- `tenant_id uuid not null`
- `script_id uuid null references content_scripts(id) on delete set null`
- `asset_type text not null` (`caption`,`thumbnail_text`,`scene_outline`,`calendar_item`,`longform_outline`,`email_draft`,`blog_draft`)
- `payload jsonb not null`
- `status text not null default 'draft'`
- `created_at timestamptz not null default now()`

Indexes:
- `(tenant_id, asset_type, created_at desc)`
- `(tenant_id, status, created_at desc)`

### `content_reviews`
Purpose: human approval log.
Columns:
- `id uuid pk`
- `tenant_id uuid not null`
- `target_type text not null` (`opportunity`,`script`,`asset`)
- `target_id uuid not null`
- `review_status text not null` (`needs_review`,`approved`,`rejected`)
- `review_reason text null`
- `reviewed_by uuid null`
- `reviewed_at timestamptz null`
- `created_at timestamptz not null default now()`

Indexes:
- `(tenant_id, review_status, created_at desc)`
- `(tenant_id, target_type, target_id)`

### `content_calendar`
Purpose: schedule-ready content plan.
Columns:
- `id uuid pk`
- `tenant_id uuid not null`
- `content_asset_id uuid not null references content_assets(id) on delete cascade`
- `platform text not null`
- `scheduled_for timestamptz null`
- `schedule_status text not null default 'planned'`
- `priority int not null default 3`
- `created_at timestamptz not null default now()`

Indexes:
- `(tenant_id, schedule_status, scheduled_for)`

### `content_generation_runs`
Purpose: run-level observability and replay.
Columns:
- `id uuid pk`
- `tenant_id uuid not null`
- `run_type text not null`
- `status text not null`
- `input_count int not null default 0`
- `output_count int not null default 0`
- `error_count int not null default 0`
- `started_at timestamptz not null default now()`
- `finished_at timestamptz null`
- `meta jsonb not null default '{}'::jsonb`

Indexes:
- `(tenant_id, run_type, started_at desc)`

## 2) Relationships
- `content_opportunities -> content_scripts -> content_assets -> content_calendar`
- `content_reviews` references any layer via polymorphic `target_type + target_id`
- `content_generation_runs` can link to outputs through metadata arrays

## 3) Queue Job Types
- `content_opportunity_scan`
- `content_dedupe_rank`
- `content_script_generate`
- `content_caption_generate`
- `content_asset_compile`
- `content_review_queue_sync`
- `content_calendar_plan`

## 4) Job Payload Examples
```json
{
  "job_type": "content_script_generate",
  "tenant_id": "<uuid>",
  "opportunity_id": "<uuid>",
  "platform": "youtube_shorts",
  "template": "hook_3tips_cta",
  "max_variants": 3
}
```

## 5) Worker Output Examples
```json
{
  "script_id": "<uuid>",
  "hook": "Stop losing funding because of this one mistake.",
  "cta_text": "Save this and review before your next application.",
  "quality_score": 84.5
}
```

## 6) Dedup Strategy
- Primary unique key: `tenant_id + opportunity_key`
- Semantic duplicate guard: embedding similarity threshold + cooldown check
- Keep rejected duplicates in table for audit/analysis (`status='dedup_rejected'`)

## 7) Approval Workflow States
Opportunity states:
- `draft -> needs_review -> approved/rejected`

Script/asset states:
- `draft -> needs_review -> approved/rejected -> scheduled -> published`

## 8) Publishing Readiness States
- `not_ready`: missing required assets
- `review_pending`: waiting human decision
- `ready_to_schedule`: approved package complete
- `scheduled`
- `published`

## 9) Retry/Failure Handling
- Worker retries with exponential backoff via existing queue policy.
- After `max_attempts`, mark queue job `dead_letter`.
- Write failure context to `system_errors` and `content_generation_runs.meta`.

## 10) Transcript Linkage
Each opportunity should persist:
- `source_ref_id` (transcript or segment id)
- segment timing metadata (`start_ms`,`end_ms`) inside `metadata`

This preserves auditability from published asset back to original source transcript.

## 11) Transcript Segment Reuse Tracking
Add optional table:
- `content_source_usage(id, tenant_id, source_ref_id, target_type, target_id, created_at)`

Use to enforce overuse caps and avoid repetitive outputs from same segment.

## 12) Quality/Scoring Fields
Store:
- `score` (overall)
- `quality_score` (editorial quality)
- `platform_fit_score` (json map per platform)
- `review_status` + `review_reason`

## 13) Suggested SQL Draft Location
- `docs/sql_drafts/content_engine_schema.sql`

## 14) Safety Constraints
- AI outputs are drafts only.
- Human approval required pre-publish.
- No client PII in generated public assets.
- Trading content remains educational/research-only.
