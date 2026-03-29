# Credit Intel Monitoring - Compliant Task Sheet

## Purpose
Use public, consented, and terms-compliant data to inform client readiness decisions and task routing. Do not use credential bypass, anti-bot evasion, fake identities, or unverified claims.

## Hard Rules (Always)
- No guarantee language (approvals, limits, rates, timing).
- No scraping behind paywalls/logins unless explicitly permitted by platform terms.
- No bypass methods (proxy evasion, stealth browser fingerprint spoofing, CAPTCHA defeat).
- No falsifying income, housing, or underwriting inputs.
- Mark every data point as `verified`, `self-reported`, or `unverified`.

## Daily Cadence
- `09:00` Intake and source review.
- `13:00` Update approval trend board.
- `17:00` Push advisor digest + flagged client tasks.

## Source Intake Workflow
1. Collect only compliant-source posts/data points.
2. Capture: card/product, bureau, score band, inquiries band, income band, business age band, reported outcome.
3. Attach source URL and timestamp.
4. Mark confidence level:
   - `high`: screenshot or multiple matching sources.
   - `medium`: single detailed source.
   - `low`: vague or no evidence.

## Client Match Workflow
1. Filter clients in `Ready to Apply` or `Pre-Qual Check`.
2. Compare client profile to recent high/medium confidence data points.
3. Output match status:
   - `strong` (close profile similarity)
   - `moderate`
   - `weak`
4. Create client task:
   - Title: `Review latest approval trend for <card>`
   - Type: `education` or `review`
   - Signal: `yellow` (or `red` if risk mismatch)

## Alerting Rules
- Trigger advisor alert when:
  - 3+ negative outcomes for same product within 24h (high confidence only), or
  - client mismatch risk rises (utilization, inquiries, or score trend).
- Never send client-facing "apply now guaranteed" messages.

## Client Message Template (Compliant)
"We found recent data points that may be relevant to your profile. This is informational only and not a guarantee of approval or limit. Reply to review your readiness before applying."

## Advisor Digest Template
- Top products by positive trend (last 24h)
- Noted risk shifts
- Strong-match clients requiring review tasks
- Confidence caveats + missing data
