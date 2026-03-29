# Nexus Funding Profile and Application Assistant Implementation Spec

## Scope
Implementation-ready, additive plan for current Nexus stack.

## 1. Schema Suggestions
### `bank_rules`
- `id uuid pk`
- `tenant_id uuid null` (null means global)
- `bank_name text`
- `product_type text`
- `rule_key text`
- `rule_text text`
- `severity text` (`info`,`warning`,`blocker`)
- `source_artifact_id uuid null`
- `confidence numeric`
- `status text` (`draft`,`approved`,`retired`)
- `created_at`, `updated_at`

### `application_guides`
- `id uuid pk`
- `tenant_id uuid`
- `client_file_id uuid`
- `bank_rule_set_id uuid null`
- `title text`
- `guide_json jsonb`
- `guide_md text`
- `status text` (`draft`,`under_review`,`approved`,`published`,`archived`)
- `generated_by text`
- `reviewed_by uuid null`
- `published_at timestamptz null`
- timestamps

### `funding_profile_patterns`
- `id uuid pk`
- `tenant_id uuid null`
- `pattern_type text` (`strength`,`weakness`,`denial_cause`,`consistency_rule`)
- `pattern_text text`
- `evidence_summary text`
- `source_count int`
- `confidence numeric`
- `status text` (`draft`,`approved`,`retired`)
- timestamps

### `funding_profile_assessments`
- `id uuid pk`
- `tenant_id uuid`
- `client_file_id uuid`
- `assessment_version text`
- `input_snapshot jsonb`
- `assessment_json jsonb`
- `score numeric`
- `risk_level text`
- `status text` (`draft`,`reviewed`,`shared`)
- timestamps

### `application_walkthrough_assets`
- `id uuid pk`
- `tenant_id uuid`
- `guide_id uuid`
- `asset_type text` (`script`,`video`,`checklist`)
- `title text`
- `content_md text null`
- `storage_path text null`
- `status text` (`draft`,`under_review`,`approved`,`published`,`archived`)
- timestamps

### Optional audit table: `funding_assistant_events`
- immutable event log for generation/review/publish actions.

## 2. Relationships
- `application_guides.client_file_id -> client_files.id`
- `application_guides.bank_rule_set_id -> bank_rules.id` (or logical grouping)
- `funding_profile_assessments.client_file_id -> client_files.id`
- `application_walkthrough_assets.guide_id -> application_guides.id`

## 3. Approval and Publication States
State machine (guides/assets):
- `draft -> under_review -> approved -> published`
- rejection path: `under_review -> draft`
- retirement path: `published -> archived`

## 4. RLS and Tenant Isolation
- tenant-scoped tables enforce `tenant_id = auth tenant context`.
- global pattern/rule rows can be read-only by policy.
- writes restricted to admin/service roles.

## 5. Queue Job Types
- `funding_pattern_extract`
- `bank_rule_extract`
- `funding_assessment_generate`
- `application_guide_generate`
- `walkthrough_asset_generate`
- `funding_assistant_qc`

## 6. Worker Responsibilities
Mac Mini research workers:
- extract patterns/rules from transcript + research artifacts.
- attach evidence summary and confidence metadata.

Fastify/safe backend workers:
- trigger guide generation jobs.
- apply policy validations.
- enforce review workflow and publish controls.

## 7. Portal UI Sections
- Funding profile summary.
- Application assistant (side-by-side).
- Rule warnings and checklist.
- Review status banner.
- Approved walkthrough assets.

## 8. Side-by-Side UI Structure
Left:
- verified profile fields (read-only when protected).
Right:
- application field guidance.
- matched bank rules and cautions.
- staff notes (staff-only visibility).

## 9. Optional PDF Export
Flow:
1. guide reaches `approved`.
2. render server-side template from approved payload.
3. store output path + hash in docs table.
4. expose signed URL to authorized viewer.

## 10. Optional Walkthrough Video/Script Flow
- generate script draft from approved guide.
- route to review queue.
- publish only approved assets.

## 11. Verified Fields Policy
Must come from verified records only:
- legal entity identity data
- business registration facts
- validated contact/business address details

## 12. AI Generation Policy
Allowed:
- explanations, sequencing, risk guidance, educational framing.

Not allowed:
- unsupported factual claims
- guaranteed outcomes
- sensitive personal identity inference

## 13. Staff Review Workflow
- role-restricted review queue.
- required reviewer comments on approval/rejection.
- audit event per state transition.

## 14. Logging Recommendations
Log events:
- generation started/completed
- review approved/rejected
- publication/archival
- client view access for published assets (policy permitting)

## 15. Phased Rollout
Phase 1:
- schema + research extraction + staff-only draft view.

Phase 2:
- client side-by-side assistant with approved guides.

Phase 3:
- walkthrough assets + education content reuse + performance analytics.
