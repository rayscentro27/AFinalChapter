# LightStream Used Auto Loan - Compliant Task Sheet

## Purpose
Provide a client-safe, compliance-first workflow for a used auto loan application through LightStream (Truist), without guarantee language or underwriting manipulation.

## Non-Negotiables
- No guarantee claims on approval, APR, funding time, or loan amount.
- No falsified application inputs (income, housing, employment, ownership, bank data).
- No guidance to bypass identity, verification, or platform controls.
- Use current lender terms at time of application (products and requirements can change).

## Required Inputs
- Current credit profile snapshot (score range + major obligations)
- Verified income figures (self-reported plus supporting docs)
- Monthly housing obligation and monthly debt obligations
- Preferred vehicle budget and target monthly payment
- Bank account for disbursement and autopay

## Task Workflow
1. Intake and risk classification.
2. Verify latest lender eligibility terms and disclosures.
3. Collect identity + income documentation package.
4. Calculate DTI/payment fit and confirm affordability.
5. Resolve blockers (credit freezes, mismatched profile data, missing docs).
6. Submit application using accurate client-provided data.
7. Handle conditional requests from underwriting quickly.
8. Confirm funding, disbursement path, and purchase controls.
9. Set autopay and retention checklist for post-funding compliance.

## Client-Facing Message Template
"We can guide your application process and readiness, but no lender decision is guaranteed. We’ll use verified information and current lender terms to reduce avoidable delays."

## Advisor Guardrail Template
- "Estimate only" language for score/income/DTI impact.
- Explicitly label unknowns as `unverified`.
- Escalate to human review if data conflicts across application fields.
- Do not coach clients to omit material liabilities or obligations.

## Online Application Link
- https://www.lightstream.com/apply?product=auto

## Mapping Note
Use `data/training/custom/lightstream_client_tasks_schema_mapped.json` to assign tenant-scoped `client_tasks` directly in schema-compatible format.

## Automation Command (Pilot + Bulk Repeat)
```bash
node scripts/import_lightstream_task_pack.mjs \
  --tenant <TENANT_UUID> \
  --start-date <YYYY-MM-DD> \
  --write-prefill data/training/custom/lightstream_client_tasks_prefilled_<tenant>_<date>.json
```
