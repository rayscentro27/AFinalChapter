# Internal 10-User Pilot Issue Owners 2026-03-23

Purpose: convert the blocker audit into an owner-based working sheet for day-0 and day-1 pilot operations.

Use this with:
- `docs/INTERNAL_10_USER_PILOT_BLOCKER_AUDIT_2026-03-23.md`
- `docs/INTERNAL_10_USER_PILOT_DAY0_EXECUTION_CHECKLIST.md`
- `docs/INTERNAL_10_USER_PILOT_ISSUE_TRACKER_TEMPLATE.md`

## Priority Issues

| ID | Issue | Severity | Owner Role | What To Check First | Suggested Fix Direction | Pilot Rule |
|---|---|---|---|---|---|---|
| PILOT-OPS-01 | Empty document-request state caused by unseeded workflow attachments | major | client-flow owner | verify one pilot user has active tasks with required attachments | seed or repair task attachment requirements before pilot start | do not start if core users cannot tell what to upload |
| PILOT-OPS-02 | Funding entitlement, disclosure, or agreement state incorrect for pilot account | major | billing or entitlement owner | verify one real pilot account in Funding Research and Funding Outcomes | correct plan state, clear stale browser tier cache, confirm disclosures and agreement state | do not start if intended paid path is blocked incorrectly |
| PILOT-OPS-03 | Workflow step advance fails with auth or permission drift | blocker | workflow or auth owner | run one real workflow action with a valid pilot account | resolve auth session, function access, or tenant-scope problem before cohort start | pause immediately on repeated 401 or 403 behavior |
| PILOT-OPS-04 | Admin readiness surfaces load but show low-signal or empty operational state | major | control-plane owner | inspect readiness endpoint and Admin Control Plane with staff account | populate or repair readiness and summary rows so operators can trust the page | do not rely on empty readiness state for go or no-go |
| PILOT-OPS-05 | Settings tabs imply unsupported AI workforce or auto-reply management | moderate | admin operations owner | brief staff on supported pilot surfaces only | redirect operators to Control Plane, Command Center, Command Inbox, Source Registry, and Neural Floor as needed | exclude unsupported settings tabs from pilot acceptance |

## Day-0 Assignment Sheet

- Pilot owner:
- Client-flow owner:
- Billing or entitlement owner:
- Workflow or auth owner:
- Control-plane owner:
- Admin operations owner:
- Worker owner:
- Decision owner:

## Day-0 Triage Order

1. Clear any blocker in `PILOT-OPS-03` before pilot start.
2. Clear `PILOT-OPS-01` and `PILOT-OPS-02` for at least one real user in each intended cohort.
3. Confirm `PILOT-OPS-04` before staff relies on readiness pages for pilot decisions.
4. Brief `PILOT-OPS-05` so unsupported tabs are not mistaken for broken pilot-critical paths.

## Escalation Rules

- If `PILOT-OPS-03` reproduces twice with valid credentials, mark `stop_condition`.
- If a user cannot identify the next required upload because of missing task attachments, mark at least `major` and decide whether that cohort can proceed.
- If funding entitlement is wrong for the pilot account after cache clear and account verification, treat it as `major` or `blocker` depending on affected path.
- If readiness pages hide blocked state, do not approve pilot start from admin pages alone.
