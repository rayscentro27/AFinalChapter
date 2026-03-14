# Nexus VideoContentWorker Design

Status: design-only, additive, no deployment, no migration execution.

## Purpose
Define a low-cost `VideoContentWorker` that turns Nexus knowledge into publish-ready content plans for YouTube, Instagram, and TikTok without changing core architecture.

## Scope and Constraints
- Keep Supabase as source of truth.
- Keep Fastify as control plane.
- Keep Mac Mini/OpenClaw as worker execution node.
- Support queue-dispatched mode and direct-run mode.
- Prefer free tooling and faceless formats.
- No live trading, no broker execution, no client PII in prompts/outputs.

## 1) Worker Responsibilities
- Read transcript and research-derived insights.
- Detect high-signal topics and map to content opportunities.
- Generate:
  - video topic ideas
  - short-form scripts
  - long-form scripts
  - scene-by-scene outlines
  - hook variants
  - caption variants
  - thumbnail text ideas
  - CTA variants
  - repurposing plans
  - weekly content calendars
- Route outputs to review queue (draft-only until approved).

## 2) Job Types
Use queue `job_queue.job_type` values:
- `video_topic_generation`
- `video_script_shortform`
- `video_script_longform`
- `video_outline_generation`
- `video_hook_generation`
- `video_caption_generation`
- `video_thumbnail_copy`
- `video_cta_generation`
- `video_repurpose_pack`
- `video_content_calendar`

Direct-run equivalents should call the same handlers with `mode=direct`.

## 3) Supabase Table Strategy (Reuse First)
Reuse existing tables where available:
- `youtube_transcripts` (input transcript corpus)
- `research_artifacts` (store generated content artifacts)
- `research_claims` (evidence extraction)
- `research_clusters` (topic clustering/trending)
- `research_briefs` (topic context)
- `coverage_gaps` (missing-topic opportunities)
- `business_opportunities` (monetization and demand tie-in)

Optional draft-only additions (do not apply automatically):
- `video_content_jobs`
  - deterministic job metadata if separate from `job_queue` is needed.
- `video_content_outputs`
  - normalized output store for UI browsing.
- `video_content_reviews`
  - approval state transitions and reviewer audit.
- `video_content_calendar`
  - publish schedule objects by channel/platform.

If no new tables are approved yet, store outputs in `research_artifacts` with:
- `artifact_type` in (`video_script`, `video_outline`, `video_calendar`, `video_repurpose_pack`)
- `meta.platforms`, `meta.format`, `meta.trace_id`, `meta.status='draft'`

## 4) Job Payload Contract
Minimal payload:

```json
{
  "tenant_id": "uuid",
  "job_type": "video_script_shortform",
  "topic": "credit_repair_dispute_timing",
  "platform": "tiktok",
  "format": "faceless_short",
  "duration_target_sec": 45,
  "audience": "new_leads",
  "tone": "educational_authority",
  "source_refs": {
    "transcript_ids": ["..."],
    "artifact_ids": ["..."],
    "brief_ids": ["..."]
  },
  "limits": {
    "max_claims": 10,
    "max_sources": 20
  },
  "trace_id": "uuid"
}
```

## 5) Worker Output Contract
All outputs must be draft-first and evidence-linked:

```json
{
  "title": "How to dispute late payments the right way",
  "platform": "youtube",
  "format": "long_form",
  "topic": "credit_repair_dispute_timing",
  "script": "...",
  "outline": [
    {"scene": 1, "goal": "hook", "voiceover": "...", "broll_hint": "..."}
  ],
  "hooks": ["..."],
  "captions": ["..."],
  "thumbnail_text": ["..."],
  "cta_variants": ["..."],
  "evidence_summary": ["claim A", "claim B"],
  "risk_notes": ["Educational only, no guarantees"],
  "status": "draft",
  "trace_id": "uuid"
}
```

## 6) Content Review Workflow
- Step 1: Worker writes draft output (`draft`).
- Step 2: Reviewer (admin/content role) approves/rejects.
- Step 3: Approved output changes to `approved`.
- Step 4: Optional publish handoff record is created.
- Step 5: Rejected output keeps revision notes and can be regenerated.

No auto-publish in this phase.

## 7) Free-Tool Production Pipeline
- Script and planning: Nexus worker outputs.
- Voiceover (free): local TTS/free tier tools.
- Visuals (free): Canva free, CapCut free, Pexels/Pixabay (license-checked).
- Editing (free): CapCut/DaVinci Resolve free.
- Captions: CapCut auto-captions or platform-native tools.
- Scheduling (low-cost/free): native YouTube/Meta/TikTok schedulers where available.

## 8) Transcript-to-Video Workflow
1. Select transcript slices by topic cluster + recency.
2. Extract top claims (max 10) with evidence summary.
3. Build topic brief (problem, why now, who benefits).
4. Generate script + outline pack by platform.
5. Add hooks, thumbnail copy, CTA variants.
6. Save as `draft` artifact with trace metadata.
7. Send reviewer notification (Telegram or dashboard flag).

## 9) Short-Form Repurposing Workflow
1. Start from approved long-form script or transcript.
2. Split into 5-12 short clips by single-idea segments.
3. Generate per-clip:
   - 1 hook
   - 1 core teaching point
   - 1 CTA
   - 1 caption set
4. Emit weekly batch plan (30-100 short items target is optional, not default).
5. Keep all clips linked to original source trace.

## 10) Safety and Approval Gates
- Hard gate: no client-specific PII in prompts or generated content.
- Hard gate: no financial guarantees or compliance-unsafe language.
- Hard gate: output remains draft until approved.
- Enforce tenant scoping on all reads/writes.
- Add rate limits and max-output-size limits per job.
- Log each generation event with `trace_id`, model/provider, and token usage.

## 11) Suggested Scaffolding Plan (Mac Mini)
Proposed module layout under `opt/nexus-services/video-content-worker/`:

```text
opt/nexus-services/video-content-worker/
  package.json
  README.md
  worker.js
  config.js
  db.js
  detector.js
  generator.js
  formatter.js
  reviewer.js
  calendar.js
  notifier.js
```

Responsibilities:
- `worker.js`: loop/direct-run entrypoint.
- `config.js`: env loading and mode flags.
- `db.js`: supabase reads/writes, tenant-safe query wrappers.
- `detector.js`: topic/opportunity selection logic.
- `generator.js`: script/outline/hook/caption generation logic.
- `formatter.js`: normalize output contract.
- `reviewer.js`: draft/approve/reject state helpers.
- `calendar.js`: weekly schedule generation.
- `notifier.js`: Telegram or dashboard alerts.

## 12) Implementation Sequence (Low Risk)
- Phase A: read-only dry run (no writes), print generated previews.
- Phase B: write drafts to `research_artifacts`.
- Phase C: add review state handling.
- Phase D: add calendar and repurpose packs.
- Phase E: enable queue dispatch for selected job types.

## 13) Test Plan
- Unit:
  - topic detector ranking
  - payload validation
  - output formatter shape checks
- Integration:
  - read `youtube_transcripts` + `research_*` inputs
  - write `research_artifacts` draft outputs
  - ensure tenant isolation checks pass
- Ops:
  - queue worker disabled by default
  - run once in direct mode with sample tenant
  - confirm health endpoints remain green

## 14) Explicit Non-Goals (This Phase)
- No schema migration execution.
- No infrastructure replacement.
- No auto-publish to social channels.
- No coupling with trading execution workflows.
