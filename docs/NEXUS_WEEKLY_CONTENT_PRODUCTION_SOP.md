# Nexus Weekly Content Production SOP

## Objective
Operate Nexus as a repeatable transcript-derived content engine with human approval before publishing.

## Weekly Schedule
### Monday
- Pull new transcripts and research artifacts.
- Run opportunity extraction + dedupe.
- Generate first script batch.

### Tuesday
- Generate captions/CTA/thumbnail text.
- Review batch A.
- Queue revisions.

### Wednesday
- Generate second script batch.
- Review batch B.
- Approve highest-priority assets.

### Thursday
- Build calendar draft for next week.
- Prepare long-form + blog/email repurposes.

### Friday
- Final approval session.
- Prepare manual publish packets.
- KPI checkpoint and retro notes.

### Saturday (optional)
- Light maintenance and backlog cleanup.

### Sunday
- Plan next week themes and target buckets.

## Daily Checklist
1. Check ingestion success/failures.
2. Check queue backlog and dead letters.
3. Run candidate generation if new source content arrived.
4. Review pending approvals.
5. Close/reject duplicates.
6. Update calendar statuses.

## Review Checklist
- Claim grounded in source?
- Messaging clear for target audience?
- No prohibited/sensitive statements?
- CTA matches goal?
- Format matches platform constraints?

## Approval Checklist
- `review_status=approved`
- Required assets present (script/caption/thumbnail text)
- Owner assigned
- Target platform selected
- Schedule window assigned

## Quality Control Checklist
- No duplicate topic in cooldown window.
- Hook quality score above threshold.
- Readability and pacing pass.
- Safety/compliance pass.
- Evidence traceability retained.

## Batch Production Checklist
- Group by content bucket and platform.
- Ensure diversity (no single bucket overload).
- Cap weekly output by quality threshold, not volume alone.

## KPI Review Checklist
- candidates_generated
- approved_rate
- rejection_reasons top 5
- median time to approval
- early retention and save/share trends

## Single-Operator Role Mapping
If one person runs all functions:
- Operator role: ingestion + queue health + generation runs.
- Editor role: quality review and approval.
- Publisher role: manual posting and analytics tracking.

## Escalation Rules
- If dead-letter queue spikes: pause generation, investigate input/source quality.
- If review backlog > threshold: reduce generation volume until caught up.
- If quality drops: tighten approval threshold and retrain templates/prompts.
