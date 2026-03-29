# Nexus Transcript-to-Video Content Engine

Status: architecture and operations plan only. No deployment, no schema execution.

## 1) Content Engine Architecture
- Control plane: Fastify backend orchestrates policy, auth, flags, and read-only reporting.
- Source of truth: Supabase stores transcript/research/opportunity/content records.
- Worker plane: Mac Mini workers (OpenClaw + Comet first, OpenRouter fallback for lightweight tasks).
- Queue plane: Supabase `job_queue` with lease/retry/dead-letter.
- Human gate: review/approval before publishing.

## 2) Transcript to Opportunity Conversion
- Ingest transcript.
- Normalize transcript into segments (30-120 seconds equivalent content slices).
- Extract claims and topic clusters.
- Map segments to content buckets.
- Generate candidate video angles with evidence links.
- Score candidates and push top items to review queue.

## 3) Weekly Pipeline for 30-100 Short-Form Candidates
- Monday: collect/ingest transcripts and run cleanup.
- Tuesday: segment + cluster + angle detection.
- Wednesday: generate hooks/scripts/captions/CTAs.
- Thursday: dedupe and quality scoring; produce calendar draft.
- Friday: human approval + batch export for production.
- Throughput target:
  - 5-15 transcripts/week
  - 3-8 strong angles/transcript
  - 30-100 shortlist candidates/week

## 4) Scoring Logic
Composite score (0-100):
- relevance to target audience (25)
- evidence quality from claims/briefs (20)
- platform fit (20)
- novelty vs prior content (15)
- urgency/trend timing (10)
- production simplicity (10)

Scoring bands:
- 80-100: priority publish queue
- 60-79: review queue
- <60: backlog/hold

## 5) Deduplication Logic
- Deterministic `dedupe_key` = hash(topic + angle + platform + source_segment_ids).
- Reject near-duplicates within rolling 30-day window.
- Semantic similarity check against recent approved drafts.
- Prevent same transcript segment from overuse unless score delta exceeds threshold.

## 6) Content Buckets
- educational
- funding/business tips
- credit education
- AI automation
- market/trading education (research-only, no execution)
- small business growth

## 7) Supabase Tables Required
Reuse first:
- `youtube_transcripts`
- `research_artifacts`
- `research_claims`
- `research_clusters`
- `research_briefs`
- `business_opportunities`
- `coverage_gaps`
- `job_queue`

Recommended additive content tables (spec-only):
- `content_opportunities`
- `content_assets`
- `content_reviews`
- `content_calendar`
- `content_segment_usage`

## 8) Queue Job Types Required
- `content_opportunity_scan`
- `content_segment_extraction`
- `content_hook_generation`
- `content_script_generation`
- `content_caption_generation`
- `content_cta_generation`
- `content_thumbnail_copy_generation`
- `content_calendar_generation`
- `content_repurpose_pack_generation`

## 9) Worker Responsibilities
- Transcript ingestion worker: collect/store transcript and metadata.
- Clipping/angle worker: segment transcript + extract candidate angles.
- Hook worker: generate hooks by platform.
- Script worker: produce short-form and long-form drafts.
- Caption worker: produce caption variants.
- CTA worker: generate CTA variants by funnel stage.
- Calendar worker: schedule approved assets into weekly plan.

## 10) Review and Approval Workflow
- `draft` -> `pending_review` -> `approved` or `rejected`.
- Rejected items require reason and regeneration notes.
- Publishing can only occur from `approved`.
- Every state change writes audit event.

## 11) Free-Tool Production Workflow
- Script generation: Nexus workers.
- Editing: CapCut free / DaVinci Resolve free.
- B-roll/media: Pexels/Pixabay/Canva free assets.
- Captions: CapCut auto-caption + manual correction.
- Scheduling: native platform tools when available.

## 12) Template-Based Faceless Formats
- subtitle-over-b-roll
- screenshot/slideshow explainer
- quote callout
- listicle
- myth-vs-fact
- hook + 3 tips + CTA
- mini lesson
- transcript highlight clip

## 13) Thumbnail and Title Workflow
- Generate 3-5 title variants per asset.
- Generate 3 thumbnail text variants with character limits.
- Score for clarity + curiosity + specificity.
- Human choose final title/thumbnail before publish.

## 14) Content Calendar and Batch Workflow
- Weekly calendar generated from highest-scoring approved assets.
- Slot by platform, bucket, and campaign objective.
- Maintain mix targets (example): 40% educational, 20% business tips, 20% credit, 20% AI/growth.
- Batch export for production in 1-2 sessions per week.

## 15) Repurposing One Long Transcript
From one high-value transcript:
- 10-30 shorts (single-angle clips)
- 1 YouTube long-form outline
- 1 blog/article draft
- 1 email newsletter draft
- 3-5 social posts

All assets link back to source transcript + segment IDs.

## 16) Safety Rules Against Low-Quality Spam
- Minimum evidence threshold before generation.
- Block repetitive hooks/titles beyond frequency cap.
- Enforce quality floor score (example: >= 60).
- Rate-limit generation per tenant and per worker.
- Never auto-publish unreviewed drafts.
- Reject policy-unsafe language automatically.

## 17) Recommended KPIs
Output KPIs:
- candidate count/week
- approved assets/week
- rejection rate
- time-to-approve

Quality KPIs:
- average content score
- duplicate rate
- manual edit effort per asset

Performance KPIs:
- view-through rate
- retention at 3s/10s
- saves/shares/comments
- CTA conversion rate

Operational KPIs:
- queue latency
- dead-letter rate
- worker freshness
- cost per approved asset

## 18) Phased Rollout Plan
Phase 1 (Manual approval):
- Generate hooks/scripts/captions/CTAs/outlines.
- Editing and posting remain manual.

Phase 2 (Semi-automated batching):
- Batch generation by bucket/template.
- Calendar and repurpose packs generated automatically.
- Human review remains required.

Phase 3 (Scaled engine with queue controls):
- Full queue-managed content pipeline.
- Strong dedupe/quality filters and alerting.
- Controlled automations with kill switches and system modes.
