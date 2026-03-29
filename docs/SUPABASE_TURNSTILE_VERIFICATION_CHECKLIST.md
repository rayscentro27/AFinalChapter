# Supabase Turnstile Verification Checklist

Use this after changing Supabase Bot Detection, Cloudflare Turnstile, or frontend auth env vars.

## 1. Hosted Supabase Dashboard
1. Open Supabase Dashboard -> Authentication -> Bot Detection.
2. Confirm Bot Detection is enabled.
3. Confirm provider is Cloudflare Turnstile.
4. Re-enter the Turnstile secret if there is any doubt about drift or copy/paste errors.

## 2. Netlify Frontend Env
1. Confirm `VITE_SUPABASE_URL` is set.
2. Confirm `VITE_SUPABASE_ANON_KEY` is set.
3. Confirm `VITE_TURNSTILE_ENABLED=true` is set.
4. Confirm `VITE_TURNSTILE_SITE_KEY` matches the same Cloudflare widget as the Supabase Turnstile secret.
5. Redeploy the frontend after any env change.

## 3. Local Supabase Parity
1. Confirm [supabase/config.toml](supabase/config.toml) still has `auth.captcha.enabled=true` if you want local parity.
2. Set `SUPABASE_AUTH_CAPTCHA_SECRET` in your local environment.
3. Run `npm run auth:check-env`.
4. Restart local Supabase before retesting.

## 4. Browser Verification
1. Open the live site.
2. Navigate to login.
3. Confirm the Turnstile widget renders.
4. Navigate to signup.
5. Confirm the Turnstile widget renders there too.
6. Attempt login without solving captcha and verify the UI blocks submission.
7. Attempt signup without solving captcha and verify the UI blocks submission.

## 5. Network Verification
1. Open browser dev tools.
2. Attempt login after solving captcha.
3. Inspect the request to `auth/v1/token`.
4. Confirm the request no longer fails immediately because of missing captcha handling on the frontend.
5. If `auth/v1/token` still returns `500`, treat the remaining issue as hosted Supabase/Turnstile configuration until proven otherwise.