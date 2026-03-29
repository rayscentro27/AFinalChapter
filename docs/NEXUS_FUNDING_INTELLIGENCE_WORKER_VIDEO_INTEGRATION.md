# Nexus Funding Intelligence Integration (Research Workers + VideoContentWorker)

## Objective
Connect Funding Profile Intelligence and Application Assistant to existing Mac Mini research workers and VideoContentWorker with low-cost, additive workflows.

## 1. Research Worker Responsibilities
Research ingestion workers should:
- parse transcripts and research artifacts for funding profile patterns.
- extract bank-specific rules and denial causes.
- cluster repeated themes into reusable guidance units.
- write structured rows into funding-intelligence tables.

## 2. Pattern Extraction Workflow
1. Ingest transcript/research artifact.
2. Extract candidate claims.
3. Score confidence and actionability.
4. Classify claim (`strength`, `weakness`, `denial_cause`, `consistency_rule`).
5. Store as draft pattern with evidence summary.
6. Queue staff review for publish eligibility.

## 3. Knowledge Storage Workflow
Primary tables:
- `funding_profile_patterns`
- `bank_rules`
- `application_guides`
- `application_walkthrough_assets`

Linking:
- each generated guide references source patterns/rules.
- each pattern references source artifact IDs and trace IDs.

## 4. Application Assistant Reuse
At guide generation time:
- pull verified profile facts.
- pull approved patterns and bank rules.
- generate guide draft with citations/evidence summary.
- require staff approval before client publication.

## 5. VideoContentWorker Reuse
Inputs:
- approved guidance snippets
- recurring denial causes
- remediation steps

Outputs:
- short educational scripts
- checklist explainers
- myth vs fact funding content
- walkthrough mini-lessons

Rule:
- only approved guidance can be used for client-facing or public content drafts.

## 6. Safeguards
- confidence threshold before candidate pattern can enter review queue.
- dedupe by normalized topic + claim hash.
- block publication on low-confidence or unsupported claims.
- enforce educational framing and no-guarantee wording.
- no sensitive identity data in scripts/guides.

## 7. Suggested Queue Jobs
- `funding_pattern_extract`
- `funding_pattern_dedupe`
- `bank_rule_extract`
- `guide_draft_generate`
- `walkthrough_script_generate`
- `video_idea_generate_funding`

## 8. Phased Recommendations
Phase 1:
- extraction + storage + review queue.

Phase 2:
- assistant generation from approved knowledge.

Phase 3:
- VideoContentWorker content reuse + KPI loop.

## 9. KPIs
- approved pattern yield rate
- guide publication turnaround time
- client checklist completion rate
- funding-denial repetition trend (target down)
- script reuse rate for educational assets
