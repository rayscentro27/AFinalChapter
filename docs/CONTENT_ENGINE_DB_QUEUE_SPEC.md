# Nexus Content Engine DB and Queue Implementation Spec

Status: implementation-ready specification. Do not auto-run migrations.

## 1) Supabase Tables

### content_opportunities
Purpose:
- candidate ideas derived from transcripts/research.

Columns:
- `id uuid pk`
- `tenant_id uuid not null`
- `opportunity_key text unique`
- `source_type text not null` (`transcript`,`research`,`opportunity`)
- `source_ref jsonb not null default '{}'`
- `bucket text not null`
- `topic text not null`
- `angle text`
- `platform_targets text[] not null default '{}'`
- `score numeric(6,2) not null default 0`
- `platform_fit_score numeric(6,2) not null default 0`
- `confidence numeric(6,2) not null default 0`
- `dedupe_key text`
- `status text not null default 'candidate'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### content_assets
Purpose:
- generated content drafts/assets linked to opportunities and transcript segments.

Columns:
- `id uuid pk`
- `tenant_id uuid not null`
- `opportunity_id uuid references content_opportunities(id)`
- `asset_type text not null` (`short_script`,`long_outline`,`caption_set`,`thumbnail_copy`,`cta_set`,`blog`,`email`,`social_post`)
- `platform text`
- `title text`
- `body text`
- `metadata jsonb not null default '{}'`
- `content_score numeric(6,2) not null default 0`
- `platform_fit_score numeric(6,2) not null default 0`
- `approval_status text not null default 'draft'`
- `publish_status text not null default 'not_ready'`
- `dedupe_key text`
- `trace_id text`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### content_reviews
Purpose:
- approval audit trail.

Columns:
- `id uuid pk`
- `tenant_id uuid not null`
- `asset_id uuid not null references content_assets(id) on delete cascade`
- `action text not null` (`submit`,`approve`,`reject`,`request_changes`)
- `reviewer_user_id uuid`
- `review_notes text`
- `created_at timestamptz default now()`

### content_calendar
Purpose:
- scheduling plan for approved assets.

Columns:
- `id uuid pk`
- `tenant_id uuid not null`
- `asset_id uuid not null references content_assets(id) on delete cascade`
- `platform text not null`
- `scheduled_at timestamptz`
- `slot_label text`
- `status text not null default 'planned'` (`planned`,`ready`,`published`,`skipped`)
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### content_segment_usage
Purpose:
- track transcript segment reuse.

Columns:
- `id uuid pk`
- `tenant_id uuid not null`
- `transcript_id uuid`
- `video_id text`
- `segment_key text not null`
- `start_second integer`
- `end_second integer`
- `asset_id uuid references content_assets(id) on delete set null`
- `reuse_count integer not null default 1`
- `last_used_at timestamptz default now()`
- `created_at timestamptz default now()`

## 2) Relationships
- `content_opportunities (1) -> (many) content_assets`
- `content_assets (1) -> (many) content_reviews`
- `content_assets (1) -> (many) content_calendar`
- `content_assets (many) -> (many) transcript segments` via `content_segment_usage`

## 3) Indexes
High-confidence indexes:
- `content_opportunities(tenant_id, status, score desc, created_at desc)`
- `content_opportunities(tenant_id, dedupe_key)` unique where dedupe_key not null
- `content_assets(tenant_id, approval_status, publish_status, created_at desc)`
- `content_assets(tenant_id, platform, content_score desc, created_at desc)`
- `content_assets(tenant_id, dedupe_key)` where dedupe_key not null
- `content_reviews(asset_id, created_at desc)`
- `content_calendar(tenant_id, status, scheduled_at)`
- `content_segment_usage(tenant_id, segment_key, last_used_at desc)`

## 4) Queue Job Types
- `content_opportunity_scan`
- `content_segment_extraction`
- `content_hook_generation`
- `content_script_generation`
- `content_caption_generation`
- `content_cta_generation`
- `content_thumbnail_copy_generation`
- `content_calendar_generation`
- `content_repurpose_pack_generation`

## 5) Job Payload Example
```json
{
  "tenant_id": "uuid",
  "job_type": "content_script_generation",
  "opportunity_id": "uuid",
  "platform": "tiktok",
  "asset_type": "short_script",
  "segment_refs": ["seg_abc_10_45"],
  "constraints": {
    "max_duration_sec": 45,
    "tone": "educational_authority",
    "audience": "new_leads"
  },
  "trace_id": "uuid"
}
```

## 6) Worker Output Example
```json
{
  "asset": {
    "asset_type": "short_script",
    "platform": "tiktok",
    "title": "Fix this common credit reporting mistake",
    "body": "Hook... points... CTA...",
    "content_score": 82,
    "platform_fit_score": 87,
    "approval_status": "draft",
    "publish_status": "not_ready"
  },
  "segment_usage": [
    {"segment_key": "seg_abc_10_45", "reuse_count": 1}
  ]
}
```

## 7) Deduplication Strategy
- `dedupe_key` on opportunity and asset rows.
- Hash inputs:
  - topic
  - angle
  - platform
  - segment_refs
- Reject insert if matching active key exists within rolling window.
- Keep override path for manual approval with reason.

## 8) Approval Workflow States
Asset lifecycle:
- `draft`
- `pending_review`
- `approved`
- `rejected`
- `archived`

Review actions must append `content_reviews` row.

## 9) Publishing Readiness States
`publish_status` lifecycle:
- `not_ready`
- `ready_for_production`
- `scheduled`
- `published`
- `failed_publish`

No automated publish required in initial phase.

## 10) Retry/Failure Handling
Queue states use existing `job_queue` lifecycle:
- `pending -> leased -> running -> completed`
- on error: `retry_wait`
- max attempts reached: `dead_letter`

Persist failure details:
- `last_error`
- `attempt_count`
- `trace_id`
- `component`

## 11) Transcript Linkage
Every opportunity/asset must include source linkage via:
- `source_ref` (opportunity)
- `metadata.source_refs` (asset)
- `content_segment_usage` rows

## 12) Segment Reuse Tracking
`content_segment_usage` enforces visibility into:
- how often segment reused
- last used timestamp
- which assets consumed it

Use this table to suppress repetitive content output.

## 13) Content Quality Fields
Track on `content_assets`:
- `content_score`
- `platform_fit_score`
- `approval_status`
- `publish_status`

These fields power ranking, review queues, and weekly planning.
