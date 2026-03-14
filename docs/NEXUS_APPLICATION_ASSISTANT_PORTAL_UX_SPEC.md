# Nexus Application Assistant Portal UX Spec

## Goal
Portal-first guided funding application UX with verified-data safety and staff approval boundaries.

## Phase 1 Scope (recommended)
- verified business profile summary
- side-by-side guidance
- bank-specific cautions
- pre-submit checklist
- review status indicator

## Section-by-Section Spec
### 1) Verified business profile summary
Purpose:
- single trusted snapshot of client business facts.

Data shown:
- legal business name
- entity type
- business address
- incorporation date
- selected verified contact details

Data source:
- verified CRM/client profile records in Supabase.

Editable vs read-only:
- protected fields read-only.
- allowed fields editable through dedicated profile flow, not inline in assistant.

Visibility:
- client-visible; staff sees validation metadata.

UI:
- summary card with verification badges.

Error states:
- missing verification -> blocking warning with remediation steps.

### 2) Side-by-side application guidance
Purpose:
- reduce application inconsistency and omissions.

Data shown:
- left: verified profile values.
- right: bank/application field guidance and recommended phrasing.

Data source:
- `application_guides`, `bank_rules`, verified profile fields.

Editable vs read-only:
- guidance text read-only for clients.
- client can enter application draft notes in separate editable pane.

Visibility:
- client + staff.
- staff-only feedback panel hidden from clients.

UI:
- split pane layout with sticky context bar.

Error states:
- no guide available -> show "awaiting staff-approved guide" state.

### 3) Bank-specific rules and cautions
Purpose:
- show constraints and red flags before submission.

Data shown:
- rule severity, caution text, and rationale.

Data source:
- approved `bank_rules` rows.

Editable vs read-only:
- read-only client.
- staff editable in admin rule management.

UI:
- warning chips and expandable caution list.

### 4) Sensitive-field warnings
Purpose:
- prevent unsafe data handling.

Data shown:
- never-enter list (SSN/password guidance).
- handling boundaries and secure upload instructions.

Data source:
- static policy + compliance config.

UI:
- persistent alert box before submit action.

### 5) Pre-submit checklist
Purpose:
- enforce completion quality gate.

Data shown:
- required sections complete/incomplete.
- consistency checks passed/failed.

Data source:
- checklist evaluator from guide + profile + user-entered answers.

Editable vs read-only:
- user marks steps complete; system validations read-only.

UI:
- checklist with progress bar and blocker badges.

### 6) Screenshot upload after decision
Purpose:
- capture decision evidence for staff follow-up.

Data shown:
- upload status and timestamp.

Data source:
- uploads storage metadata + linked application record.

Visibility:
- client upload; staff review.

UI:
- upload dropzone + note field.

### 7) Walkthrough video/script support
Purpose:
- educational guidance for complex sections.

Data shown:
- approved script/video asset list.

Source:
- `application_walkthrough_assets` with approved status.

UI:
- embedded player or script accordion.

### 8) Approval/review status indicators
Purpose:
- show whether content is draft/reviewed/approved.

Data shown:
- guide status, reviewer, last update.

Source:
- guide workflow status fields.

UI:
- status banner at top of assistant page.

### 9) Optional PDF download
Purpose:
- offline reference for approved guidance only.

Data shown:
- export button when status is `approved` or `published`.

Source:
- approved guide export artifact.

## Staff-only vs Client-visible
Client-visible:
- approved guides, warnings, checklist, upload panel, approved walkthrough assets.

Staff-only:
- review notes, confidence scores, evidence trace, moderation controls.

## Safe Wording Guidelines
Use:
- "Guidance", "recommended", "review before submit".

Avoid:
- "Guaranteed approval", "certain funding", "automatic eligibility".

## Missing Data and Failure States
- missing verified profile fields: block high-risk sections.
- missing bank rules: show neutral fallback guidance.
- stale/unapproved content: show pending-review state.

## Phase 2 Candidates
- smart comparison between two lenders.
- in-flow draft diffing.
- personalized remediation plan timeline.
