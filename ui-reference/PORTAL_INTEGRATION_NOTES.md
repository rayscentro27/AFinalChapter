# Portal Integration Notes

## Purpose

Track implementation details, dependencies, and integration constraints for the portal reference assets and spec.

## Reference Inputs

- Spec: `ui-reference/PORTAL_SPEC.md`
- Screenshots: `ui-reference/screenshots/`
- Icons: `ui-reference/icons/`

## Dropped Source Files

- `ui-reference/screenshots/Nexusone_Client_Portal_V2.jsx`
	- confirms the five primary modules: overview, credit, funding, business, grants
- `ui-reference/screenshots/Nexus_Codex_Execution_Prompts.txt`
	- defines the intended route group, API work, multi-tenant enforcement, and phased rollout
- `ui-reference/screenshots/README.txt`
	- marks this as the Option C asset package

## Visual Constraints

- Preserve LIGHT MODE as the default and primary UI standard.
- Keep the portal aesthetic clean, minimal, and high trust.
- Evaluate implementation decisions against a `$100M fintech UI` quality bar.

## Portal Route Targets

- Homepage refresh
- `/portal/overview`
- `/portal/credit`
- `/portal/funding`
- `/portal/business`
- `/portal/grants`

## Data and API Targets From Reference

- `GET /api/portal/overview`
	- aggregate credit, funding, business setup, grants, and next priority actions
- credit module integration
	- score cards, negative items, utilization, action plan, key items, uploads
- funding module integration
	- matched offers, readiness, capital range, gaps, lender table, uploads
- business module integration
	- entity status, compliance items, profile strength, roadmap, records upload
- grants module integration
	- matched grants, deadlines, value, readiness, roadmap, packet uploads
- shared upload pipeline
	- one upload model across modules using Supabase Storage plus metadata rows
- permissions and tenant enforcement
	- client, staff, and admin boundaries at Fastify and Supabase layers

## Recommended Delivery Order

1. homepage refresh
2. portal shell and module row
3. executive overview
4. credit module
5. funding module
6. business module
7. grants module

## Practical Note

- The `screenshots/` directory currently contains both image assets and reference source files. Treat the JSX and prompt text files as design/integration references, not runtime assets.

## Integration Checklist

- Map reference screens to existing routes or components
- Note missing assets or mismatched states
- Record API/data dependencies
- Track implementation gaps between design and code

## Open Notes

- Add portal integration findings here as work progresses.