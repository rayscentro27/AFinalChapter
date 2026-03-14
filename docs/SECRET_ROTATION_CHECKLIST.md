# Secret Rotation Checklist

## Purpose
This checklist is for rotating and validating secrets after env hygiene cleanup and Doppler migration.

## What Was Confirmed
- Tracked `*.example` files are placeholder-based (no live secret values detected).
- Live secrets exist in local-only env files (`.env`, `.env.local`, `gateway/.env`, `.netlify/.env`, service-level `.env`).
- Doppler project/config in use: `nexuscrm / dev_personal`.

## Immediate Actions
1. Rotate any secret previously stored in local env files and/or copied across machines.
2. Set rotated values in Doppler first.
3. Restart local services using `doppler run ...` only.
4. Remove/expire old values in local files where possible.

## Priority Rotation Order
1. `SUPABASE_SERVICE_ROLE_KEY`
2. `INTERNAL_API_KEY`
3. `SUPABASE_JWT_SECRET`
4. `ORACLE_CRON_TOKEN`
5. `TRADINGVIEW_WEBHOOK_SECRET`
6. `TELEGRAM_BOT_TOKEN`
7. `OANDA_API_KEY`
8. `META_*` app/page tokens and verify tokens
9. `TWILIO_*` credentials
10. `WHATSAPP_*` tokens/secrets
11. `GEMINI_API_KEY` / `OPENROUTER_API_KEY` / `NVIDIA_NIM_API_KEY`

## Current Missing/Placeholder Keys (Doppler)
Fill these in Doppler (`nexuscrm/dev_personal`) before production use:
- `AI_API_KEY`
- `ALERTS_WEBHOOK_URL`
- `GEMINI_API_KEY`
- `MATRIX_WEBHOOK_TOKEN`
- `META_APP_SECRET`
- `META_PAGE_ACCESS_TOKEN`
- `META_VERIFY_TOKEN`
- `NVIDIA_NIM_API_KEY`
- `OPENROUTER_API_KEY`
- `SUPABASE_JWT_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `WHATSAPP_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_WEBHOOK_SECRET`

## Doppler Commands
```bash
cd /home/rayscentro/Projects/AFinalChapter_linux
doppler secrets --project nexuscrm --config dev_personal --only-names
```

Set/update one key:
```bash
doppler secrets set KEY_NAME="value" --project nexuscrm --config dev_personal
```

Bulk update from local file:
```bash
doppler secrets upload .doppler.missing.env --project nexuscrm --config dev_personal
```

Run services with injected secrets:
```bash
doppler run --project nexuscrm --config dev_personal -- npm --prefix gateway run start
doppler run --project nexuscrm --config dev_personal -- npx netlify functions:serve -p 9999
```

## Verification
1. Gateway health and auth checks pass with expected status codes.
2. Protected routes reject missing bearer and allow valid bearer.
3. Functions requiring provider credentials return expected behavior.
4. No secrets are committed in tracked files (`git diff` / secret scan).

## Safe Local Hygiene
- Keep `.env`, `.env.local`, `gateway/.env`, `.netlify/.env` out of git.
- Keep `.doppler.missing.env` out of git.
- Prefer Doppler as the source of runtime secrets.
- Do not paste secrets into chat, tickets, or PR descriptions.
