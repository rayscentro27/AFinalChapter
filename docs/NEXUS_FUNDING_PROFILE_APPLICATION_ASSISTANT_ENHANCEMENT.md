# Nexus Funding Profile and Application Assistant Enhancement

## 1. Executive Summary
Add a portal-first Application Assistant and Funding Profile Intelligence layer that improves consistency and coaching quality for funding applications while preserving current architecture and privacy boundaries.

## 2. Application Assistant in Current Portal
Placement:
- Client portal module under funding workflows.
- Staff admin review panel in CRM admin area.

Core behavior:
- Pull verified business profile facts from trusted records.
- Overlay bank-specific rules and consistency checks.
- Show side-by-side guidance while completing an application.
- Require staff review before publishing client-facing guide updates.

## 3. Side-by-Side Guidance View
Left panel:
- verified business profile facts (read-only where required).

Right panel:
- bank/application-specific fields and guidance.
- cautions, mismatch warnings, and consistency tips.

Rules:
- AI suggestions cannot overwrite verified fields.
- client editable fields are explicitly marked.

## 4. Walkthrough Video Support
Support short assets:
- 2-5 minute walkthrough scripts.
- optional video snippets tied to guidance sections.
- staff-approved assets only.

## 5. Funding Profile Intelligence (Mac Mini Workers)
Workers ingest transcripts/research and extract:
- strong/weak profile patterns
- frequent denial causes
- bank-specific consistency rules
- practical remediation patterns

Writes to Supabase knowledge tables with review states.

## 6. Suggested New Tables
- `bank_rules`
- `application_guides`
- `funding_profile_patterns`
- `funding_profile_assessments`
- `application_walkthrough_assets`

## 7. Suggested Job Types
- `funding_pattern_extract`
- `bank_rule_extract`
- `application_guide_generate`
- `funding_profile_assess`
- `walkthrough_script_generate`
- `application_guide_publish_review`

## 8. Verified Data vs AI-Generated Data
Verified-only sources:
- legal business name
- EIN (if present in verified records)
- business address
- incorporation date
- business entity type
- verified revenue ranges if policy allows

AI-generated allowed:
- explanation text
- checklist sequencing
- risk warnings
- rewrite suggestions
- educational examples

AI disallowed:
- inventing business facts
- inventing approvals/eligibility
- requesting SSN, DOB, passwords
- guaranteed funding claims

## 9. Review and Approval Workflow
Draft lifecycle:
1. Generated draft (`draft`).
2. Staff review (`under_review`).
3. Approved (`approved`).
4. Published to client view (`published`).
5. Archived (`archived`).

Controls:
- every publish action includes reviewer id and timestamp.
- rejected drafts retain feedback trail.

## 10. Reuse with VideoContentWorker
Approved guidance and patterns can generate:
- educational scripts
- FAQ clips
- compliance-safe funding lessons
- short walkthrough narrations

Output remains educational and non-guarantee.

## 11. Phased Plan
Phase 1:
- pattern extraction + bank rules + staff-only guidance drafts.

Phase 2:
- client-facing side-by-side assistant with review gate.

Phase 3:
- walkthrough asset library + content-worker reuse + KPI dashboards.
