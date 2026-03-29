# Nexus Weekly Content Production SOP

Status: operational SOP for manual-first execution.

## 1) Weekly Schedule

Monday:
- transcript collection and ingestion
- transcript cleanup and segmentation

Tuesday:
- opportunity extraction and scoring
- shortlist top candidates by bucket/platform

Wednesday:
- batch generation (hooks/scripts/captions/CTAs/thumbnails)
- long-form repurpose pack generation

Thursday:
- review, edits, and approvals
- calendar build for next 7 days

Friday:
- production prep (assets, captions, metadata)
- analytics review and next-week adjustments

## 2) Daily Checklist
- Verify system health and queue status.
- Process transcript intake queue.
- Validate dedupe checks before generation.
- Generate new candidate batch.
- Review top-priority drafts.
- Update calendar and status fields.

## 3) Review Checklist
- Is the claim evidence-backed?
- Is language clear, concise, and non-spammy?
- Is the format right for platform and duration?
- Is there a strong hook and concrete takeaway?
- Does CTA match funnel goal?

## 4) Approval Checklist
- `content_score >= threshold` (example 70)
- `platform_fit_score >= threshold` (example 70)
- no policy/PII risk
- not a recent duplicate
- reviewer notes recorded

## 5) Quality Control Checklist
- no unsupported guarantees
- no repeated template overuse
- no recycled hook in same week beyond cap
- spelling/grammar check complete
- subtitle readability and timing validated

## 6) Batch Production Checklist
- Group by platform + template.
- Export approved scripts and captions in batch.
- Build thumbnail text set (3 options each).
- Assemble faceless assets with free tools.
- Mark production completion state in content tables.

## 7) KPI Review Checklist
Output:
- candidates generated
- approved assets
- rejected assets and reasons

Engagement:
- retention, shares, saves, comments
- CTA response/conversion

Operational:
- queue latency
- dead-letter rate
- worker freshness
- cost per approved asset

## 8) One-Person Team Roles (Manual-First)
- Research lead: transcript intake and opportunity extraction.
- Script lead: hooks/scripts/captions/CTAs.
- Reviewer/Editor: quality checks and approvals.
- Production lead: assemble faceless videos.
- Analyst: KPI review and next-week plan.

One person can perform all roles in sequence with time blocks.

## 9) Suggested Time Blocks (Solo Operator)
- 90 min transcript/research processing
- 120 min script and asset generation
- 90 min review and edits
- 120 min production assembly
- 60 min KPI and planning

## 10) Safety Rules
- No auto-publish in Phase 1.
- No client PII in content prompts/outputs.
- All content remains educational, non-guaranteed.
- Keep tenant boundaries server-enforced.
