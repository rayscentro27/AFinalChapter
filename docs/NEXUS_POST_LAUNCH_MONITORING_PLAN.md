# Nexus Post-Launch Monitoring Plan

## Purpose
Define daily/weekly operational checks and alert conditions after launch.

## Core Metrics
- Queue depth by status (`pending`, `running`, `retry_wait`, `dead_letter`).
- Worker heartbeat freshness and stale count.
- API error rate and p95 latency.
- Control-plane state drift from expected mode.
- AI usage and cache hit/miss rates.
- Integration webhook failures (Meta/Twilio/Stripe/etc).

## Alert Triggers
- Dead-letter growth above threshold over 15 minutes.
- Worker stale count > configured threshold.
- Auth error spike (> baseline multiplier).
- Rapid cost growth or cache hit collapse.
- Any suspected tenant-isolation anomaly.

## Daily Ops Checks
1. Verify `/api/system/health` and `/api/system/errors`.
2. Review `/api/system/jobs` oldest pending + dead-letter.
3. Review `/api/system/workers` freshness.
4. Review integration-specific failures.

## Weekly Ops Reviews
- Incident trend summary.
- Top retry/dead-letter job classes.
- Queue tuning opportunities.
- Secret rotation and environment drift review.

## Incident Response Basics
- Severity classification (`SEV1/SEV2/SEV3`).
- 15-minute triage checklist.
- Rollback and feature-flag disable order.
- Postmortem within 48 hours for SEV1/SEV2.
