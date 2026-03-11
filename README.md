
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
   - Add a key named `API_KEY`.
   - Set the value to your **Google Gemini API Key**.
   - (Optional) Set `VITE_BACKEND_MODE` to `mvp_mock` (default).
4. **Deploy:**
   - Click **"Deploy Site"**. Netlify will build the app using the included `netlify.toml` and `vite.config.ts`.

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
