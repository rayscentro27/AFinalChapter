# Nexus Revamp Execution Tracker

Single source of truth for phased Nexus portal/client revamp execution.

## Rules

- Work one phase at a time.
- Do not proceed automatically.
- Every phase must end with implementation, verification, summary, and approval.
- No dead-end cards, routes, buttons, or modules.
- Every click must map to: `Click -> Context -> Action -> Progress -> Reward -> Next Step`

## Phase Tracker

| Phase | Name | Status | Notes |
| --- | --- | --- | --- |
| 1 | Client Command Center | In progress | Hero, journey progress, badges, funding range, and trading unlock implemented in the client command center. |
| 2 | Business Foundation System | Complete | Business foundation is now a clickable, gated first step tied to command center state. |
| 3 | 1-Click Launch Mode | In progress | New business path + existing business intake path. |
| 4 | Auto Website + Identity Preview | In progress | Preview-first website/domain/email generation. |
| 5 | 1-Click Credit Analysis + Dispute Engine | In progress | Upload -> analyze -> letters -> DocuPost send. |
| 6 | Opportunity Database + Matching | Complete | Business opportunity storage, starter catalog, and rule-based matching are in place. |
| 7 | Opportunity UI Layer | In progress | Featured opportunity, top recommendations, detail panel, and connected next steps are being layered into the command center. |
| 8 | Global Tile Interaction System | Pending | Enforce non-dead-end interaction rules across portal surfaces. |
| 9 | Affiliate + Revenue Loop | Pending | Invite and earn, earnings tracking, journey-triggered prompts. |
| 10 | Retention Tracking | Pending | Event model, progression/drop-off metrics, admin visibility. |
| 11 | CEO Revenue Dashboard | Pending | Executive revenue, funnel, referral, and retention reporting. |
| 12 | AI Growth Suggestion Layer | Pending | Internal growth suggestions for upsell/referral/re-engagement. |

## Current Focus

### Phase 4 Goals

- Add a preview-first website and identity layer above Business Foundation.
- Generate website structure, domain suggestions, and business email suggestions from launch-mode data.
- Let users carry selected domain/email/content into the live identity fields.
- Keep the next steps tied to setup and credibility, not a paid deploy.

### Exit Criteria

- Users see a website and identity preview after launch-mode staging.
- Domain and business email selections can be applied into the live business profile.
- Website copy stays editable and preview-first.
- The preview connects back to Business Foundation and readiness instead of ending in a dead card.

### Phase 5 Goals

- Turn the credit module into one connected action center.
- Show upload, analysis, letters, finalized packet, and certified-mail state in one place.
- Reuse the current upload page, recommendation fetch, draft-letter generation, and DocuPost preview/send path.
- Keep status/history visible to the client so the workflow feels operational rather than static.

### Phase 6 Goals

- Add the business opportunity catalog schema and matching tables.
- Seed a small opportunity catalog that is connected to setup, funding, and grants.
- Create a rule-based matching function using readiness, funding estimate, business progress, path, and grant fit.
- Persist tenant-safe client opportunity matches so the next UI phase can render live recommendation cards.

### Phase 7 Goals

- Surface a featured business opportunity below the funding range widget.
- Show the top three recommendation cards with connected CTAs.
- Add an opportunity details panel that explains match reasons, requirements, risks, and next steps.
- Keep setup, funding, and grants directly reachable from every opportunity card.
