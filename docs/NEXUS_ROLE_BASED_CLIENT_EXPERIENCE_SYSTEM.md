# Nexus Role-Based Client Experience System

## Role System Design

The portal now derives a client experience profile from existing live workflow signals instead of creating a parallel profile engine.

### Inputs used

- Business maturity
  - `business.readiness.path`
  - `contact.timeInBusiness`
  - `contact.revenue`
- Credit posture
  - latest credit analysis or report score when available
  - recommendation volume as a fallback signal
- Funding readiness
  - `roadmap.stage`
  - `roadmap.readiness.ready`
  - funded/post-funding status

### Implemented dimensions

- `businessMaturity`: `startup` or `established`
- `creditBand`: `high_credit`, `building_credit`, `low_credit`, or `unknown`
- `readinessBand`: `early_stage`, `funding_ready`, `application_active`, or `post_funding`

### Implemented client profile types

- `startup_credit_builder`
- `startup_funding_ready`
- `established_credit_rebuild`
- `established_funding_ready`
- `established_growth_operator`
- `post_funding_operator`

### Experience config responsibilities

- Hero/title emphasis
- Messaging tone label and summary
- Primary goal and highlighted workspace targets
- Task-priority order by portal target
- Recommendation cards routed to specific portal areas

## UI Adaptation Plan

### Implemented now

- Header hero text adapts by profile
- Experience profile pill is shown in the portal header
- Specialized workspaces are sorted by experience emphasis
- Home screen includes an experience-mode card with tone, focus, and recommendations
- Action Center task ordering is adapted to the client profile
- Footer copy adapts to the experience mode
- Document workspace copy and stage grouping now react to the active experience config
- Message center header tone and compose guidance now react to the active experience config

### Current examples

- Startup + early-stage
  - Business Foundation and Documents move ahead of Funding Roadmap
  - Messaging becomes more guided and instructional
- Established + low credit
  - Credit Center and Documents get stronger emphasis
  - Task ordering deprioritizes aggressive funding motion
- Funding-ready
  - Funding Roadmap, Activity, and Documents move to the front
  - Messaging becomes more execution-oriented
- Post-funding
  - Capital Protection and Capital Allocation dominate the experience
  - Optional grant/trading paths remain secondary

### Recommended next expansion

- Persist `client_profile_type` into a tenant-facing profile table if operators need to override the derived profile
- Add `experience_config` snapshots to analytics if the team wants cohort reporting
- Allow AI prompt roles to receive `client_profile_type` and `experience_config` so tone and guidance stay aligned end-to-end
- Extend additional surfaces like offers, account, and admin views to consume the same config directly for deeper per-profile adaptation