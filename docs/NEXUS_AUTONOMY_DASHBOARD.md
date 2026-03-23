# Nexus Autonomy Visibility Dashboard

## Dashboard Plan

- Internal-only admin page focused on AI workforce visibility
- Primary sections:
  - alert strip for high failure rates, stale contexts, and excessive suppression
  - current agent context panel for live stage and cooldown state visibility
  - events panel for recent system events
  - agent activity cards for actions per agent
  - handoff log for agent-to-agent coordination
  - skipped actions for cooldown/duplicate suppression
  - failures panel for event/action/message breakdowns
  - summary metrics for processed events, tasks created, and messages generated

## Components

- `AdminAutonomyDashboard`
  - page shell, tenant filter, time window selector, agent/stage/failure-source filters, refresh, loading and empty states
- `AutonomyAlertStrip`
  - elevated failures, stale contexts, and skipped-action pressure
- `AutonomySummaryCards`
  - processed events, tasks created, messages generated, active contexts, handoffs, skipped actions, failures
- `AutonomyContextPanel`
  - current client-stage records, owner agent, recent event counts, action counts, cooldown keys
- `AutonomyAgentActivityCards`
  - per-agent action counts, top action, task creation, handoff count, failures
- `AutonomyLogPanels`
  - handoff log
  - skipped actions
  - failures
- `AutonomyEventsPanel`
  - recent system event table with payload preview and processing state

## Hooks

- `useAutonomyDashboard`
  - staff-authenticated fetch to the Netlify admin endpoint
  - supports tenant, time window, agent, stage, failure-source, and limit controls
  - exposes `payload`, `loading`, `refreshing`, `error`, and `refresh`

## Backend

- `GET /.netlify/functions/admin-autonomy-dashboard`
  - staff-only
  - aggregates from:
    - `system_events`
    - `agent_context`
    - `agent_action_history`
    - `internal_messages`
  - supports tenant filtering, time windows, agent filtering, stage filtering, failure-source filtering, and larger result windows

## QA Notes

- Loading state shown while tenant list or dashboard data is fetching
- Empty state shown when the selected window has no recorded autonomy activity
- All content is staff-only and not exposed in client-facing routes