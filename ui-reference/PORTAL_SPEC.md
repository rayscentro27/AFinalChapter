# Portal Spec

## Purpose

Define the reference UI structure, interaction model, and design expectations for the portal.

## Visual Standard

- Theme: LIGHT MODE
- Primary UI standard: clean, minimal, high-trust fintech
- Design target: `$100M fintech UI`

## Scope

- Primary portal screens
- Navigation structure
- Shared UI components
- States and edge cases
- Integration touchpoints

## Assets

- Screenshots: `ui-reference/screenshots/`
- Icons: `ui-reference/icons/`

## Current Reference Package

- `01_module_row.png`: top-level module selector row for the portal shell
- `02_executive_overview.png`: overview / command-view screen with KPI cards, priority actions, and progress chart
- `03_credit_module.png`: credit module screen with profile metrics, action plan, and attention table
- `04_funding_module.png`: funding module reference
- `05_business_module.png`: business setup module reference
- `06_grants_module.png`: grants and opportunities module reference
- `ChatGPT Image Mar 24, 2026, 06_13_25 PM.png`: additional visual reference image
- `Nexusone_Client_Portal_V2.jsx`: lightweight route/module stub for the portal modules
- `Nexus_Codex_Execution_Prompts.txt`: rollout and integration prompt set
- `README.txt`: package note for the dropped reference assets

## Intended Route Group

- `/portal/overview`
- `/portal/credit`
- `/portal/funding`
- `/portal/business`
- `/portal/grants`

## Screen Intent

- Module row: horizontal selector for the five core portal modules with concise descriptions
- Executive overview: one command-view page that summarizes credit, funding, business setup, and grants in a single high-level dashboard
- Credit dashboard: profile strength, negative items, utilization, guided action plan, and key items requiring attention
- Funding dashboard: matched offers, readiness, capital range, and lender-facing gaps
- Business dashboard: business setup status, compliance, roadmap, and implementation tasks
- Grants dashboard: matched opportunities, deadlines, readiness, and application packet progress

## Visual Cues From Reference

- Large rounded white containers on a light neutral canvas
- Soft pastel KPI card fills to separate module categories without adding visual noise
- Strong dark headings with restrained supporting text
- High whitespace, minimal ornament, and trust-first layout density
- Clear task prioritization and progress visibility over decorative visuals

## Notes

- Add screen-by-screen references here.
- Document expected behaviors before implementation changes.
- Keep this file aligned with `PORTAL_INTEGRATION_NOTES.md`.