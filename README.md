
# Nexus Financial OS - Delivery & Handover

Nexus is an AI-Powered Operating System for business funding agencies. This package contains everything you need to deploy your own private instance.

---

## 🚀 Deployment Guide (Netlify)

1. **Create Repository:** 
   - Upload these files to a brand new repository on GitHub, GitLab, or Bitbucket.
2. **Link to Netlify:**
   - Log in to [Netlify.com](https://netlify.com).
   - Click **"Add New Site"** > **"Import an existing project"**.
   - Select your new repository.
3. **Configure Environment:**
    - In the "Build & Deploy" section of Netlify, go to **Environment Variables**.
    - Required for Supabase auth:
       - `VITE_SUPABASE_URL`
       - `VITE_SUPABASE_ANON_KEY`
    - Required when Supabase Bot Detection is enabled:
       - `VITE_TURNSTILE_ENABLED=true`
       - `VITE_TURNSTILE_SITE_KEY=<Cloudflare Turnstile site key>`
    - Optional app configuration:
       - `VITE_API_BASE_URL`
       - `VITE_BACKEND_MODE`
    - Local Supabase CLI parity uses `SUPABASE_AUTH_CAPTCHA_SECRET`.
    - Run `npm run auth:check-env` before deploy if auth or captcha settings changed.
4. **Deploy:**
   - Click **"Deploy Site"**. Netlify will build the app using the included `netlify.toml` and `vite.config.ts`.

## Auth Smoke Test

Run this after changing Supabase auth, Turnstile, or frontend env vars.

1. Open the login page and confirm the Turnstile widget renders.
2. Open the signup page and confirm the Turnstile widget renders there too.
3. Attempt login without solving captcha and verify the UI blocks submission.
4. Attempt signup without solving captcha and verify the UI blocks submission.
5. Complete captcha and sign in successfully.
6. If email confirmations are enabled, create a new account and verify the UI tells you to confirm email before signing in.

Detailed operator steps live in [docs/SUPABASE_TURNSTILE_VERIFICATION_CHECKLIST.md](docs/SUPABASE_TURNSTILE_VERIFICATION_CHECKLIST.md).

---

## 👑 Activating Your Admin Account

**CRITICAL:** The very first user to register on your new site will be granted **Master Administrator** privileges.

1. Once the site is live, visit your Netlify URL.
2. Go to the **"Apply Now"** or **"Sign Up"** page.
3. Register with your own email and name.
4. You will be automatically redirected to the **Nexus Activator** (Setup Wizard).
5. Follow the on-screen steps to verify your AI link and set your agency branding.

---

## 🛠️ System Maintenance

- **Changing the Admin:** If you need to promote another user to Admin, you can do so in the `profiles` table if using Supabase, or manually via the system settings if using MVP mode.
- **AI Core:** Ensure your Google AI Studio project has a valid billing method if you exceed the free tier limits.

---

## 🛡️ Security

Nexus is built with bank-grade UI patterns and secure data handling.
- **Client Vault:** All documents are stored with unique UUID paths.
- **Neural Bridge:** AI handshakes are performed server-side or via secure environment variables.

© 2024 Nexus Intelligence OS.
