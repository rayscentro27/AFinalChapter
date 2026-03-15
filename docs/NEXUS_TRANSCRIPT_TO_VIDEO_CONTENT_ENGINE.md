# Nexus Transcript-to-Video Content Engine

## Goal
Convert existing Nexus transcript and research knowledge into a repeatable pipeline that produces 30-100 short-form video candidates per week (YouTube Shorts, Instagram Reels, TikTok) with human approval gates and low-cost tooling.

## Constraints
- Keep existing Nexus architecture unchanged.
- Supabase remains source of truth.
- Mac Mini workers (OpenClaw + Comet) remain primary research/content workers.
- OpenRouter free models are fallback-only.
- No autonomous publishing in Phase 1.
- Human review required before client/public publishing.

## 1) Content Engine Architecture
Flow:
1. Transcript ingestion produces normalized segments.
2. Research workers enrich claims/clusters/opportunities.
3. Content opportunity worker creates short-form candidates.
4. Scoring/ranking worker prioritizes top candidates.
5. Script/caption/CTA workers generate production assets.
6. Review queue routes assets to staff approval.
7. Approved assets are exported to a weekly content calendar.

## 2) Transcript -> Opportunity Conversion
- Split transcript into semantic segments (45-180 sec windows).
- Map segments to topic taxonomy and content buckets.
- Attach evidence from `research_claims` and `research_clusters`.
- Detect angle types: tip, myth-bust, case, warning, framework.
- Emit normalized opportunity records with traceability (`source_transcript_id`, `segment_start`, `segment_end`).

## 3) Weekly 30-100 Candidate Pipeline
Weekly cadence target:
- Input: 20-40 transcripts or equivalent segment volume.
- Candidate generation: 150-300 raw short candidates.
- Dedup/ranking: 30-100 high-quality candidates.
- Final approved batch: 20-60 publish-ready assets.

Suggested run windows:
- Daily ingestion windows (2x/day).
- Daily candidate scoring (nightly).
- Batch review sessions (Mon/Wed/Fri).

## 4) Scoring Logic
Composite score (0-100):
- Repetition strength across sources (20)
- Actionability (20)
- Audience utility (20)
- Novelty/freshness (15)
- Monetization relevance (10)
- Platform fit confidence (15)

Hard penalties:
- Duplicate concept within cooldown window.
- Weak evidence support.
- Compliance-risk wording.

## 5) Deduplication Logic
Primary dedupe key:
- `sha256(normalized_topic + angle + core_claim + target_platform)`

Secondary similarity checks:
- Embedding similarity against prior published ideas.
- Transcript segment overlap threshold (e.g., >70% overlap).

Cooldown rules:
- Do not regenerate near-identical short within 21 days unless status override approved.

## 6) Content Buckets
- Educational
- Funding/business tips
- Credit education
- AI automation
- Market/trading education (research-only)
- Small business growth

Each record should include `content_bucket` and `audience_stage` (awareness, evaluation, action).

## 7) Supabase Tables Required (Design Layer)
- `content_opportunities`
- `content_scripts`
- `content_assets`
- `content_reviews`
- `content_calendar`
- `content_generation_runs`
- `content_performance_snapshots`

## 8) Queue Job Types
- `content_opportunity_scan`
- `content_candidate_rank`
- `content_script_generate`
- `content_caption_generate`
- `content_cta_generate`
- `content_thumbnail_text_generate`
- `content_calendar_batch`

## 9) Worker Responsibilities
- Transcript ingestion worker: segment + normalize source text.
- Angle detector: identify hookable moments.
- Opportunity ranker: score + dedupe candidates.
- Script generator: short + long outlines.
- Caption/CTA generator: platform-specific supporting copy.
- Calendar worker: schedule-ready draft plan.

## 10) Review and Approval Workflow
Statuses:
- `draft`
- `needs_review`
- `approved`
- `rejected`
- `scheduled`
- `published`

Rules:
- AI outputs are drafts only.
- Staff approval required for `approved` transition.
- Rejections capture reason code for quality feedback loops.

## 11) Free-Tool Production Workflow
Recommended low-cost stack:
- Scripting/planning: Nexus portal + Google Docs/Notion
- Editing: CapCut free / DaVinci Resolve free
- Subtitles: CapCut free / YouTube auto-captions correction
- Thumbnail drafting: Canva free
- Scheduling (Phase 1 manual): native platform schedulers

## 12) Template-Based Faceless Formats
Use a reusable template library (see `docs/NEXUS_FACELESS_VIDEO_TEMPLATE_LIBRARY.md`).
Examples:
- Hook + 3 tips + CTA
- Myth vs fact
- Quote callout + evidence
- Step-by-step framework

## 13) Thumbnail/Title Workflow
- Generate 3-5 title options per approved candidate.
- Generate 3 thumbnail text variants (<= 6 words preferred).
- Enforce readability and compliance checks before final selection.

## 14) Content Calendar and Batch Production
- Weekly planning board generated every Sunday.
- Group by bucket + platform + effort tier.
- Batch scripts in blocks (e.g., 15 scripts/session).
- Link calendar item to asset IDs and review status.

## 15) One Transcript Repurposing Target
From a strong transcript:
- 10-30 short candidates
- 1 long-form YouTube outline
- 1 blog/article draft
- 1 email draft
- 3-5 social post drafts

## 16) Anti-Spam / Quality Safety Rules
- Minimum evidence threshold before candidate activation.
- Hard cap per niche per week to avoid feed saturation.
- Reject unsupported claims automatically.
- Require quality score threshold for batch inclusion.

## 17) Recommended KPIs
Production KPIs:
- candidates_generated
- candidates_approved_rate
- avg_time_to_approval
- duplicate_rejection_rate

Outcome KPIs:
- retention_3s / retention_15s
- save/share rate
- CTR (title/thumbnail)
- conversion-assist events (if tracked)

## 18) Phased Rollout
### Phase 1 (Manual Approval)
- Generate opportunities/scripts/captions only.
- Human edits and manual publishing.

### Phase 2 (Semi-Automated Batch)
- Batch calendar generation + template auto-selection.
- Human gate still required for publish.

### Phase 3 (Scaled Engine)
- Queue-aware orchestration, content SLOs, stronger quality feedback loops.

## Safe Implementation Note
This plan is additive and does not require infrastructure replacement. It preserves Fastify control-plane ownership and Supabase system-of-record posture.
