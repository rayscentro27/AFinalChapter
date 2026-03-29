# Supabase Auth Hardening Runbook (P0-4)

This runbook documents required hosted Supabase dashboard changes. It does **not** auto-apply hosted changes.

## 1) Signup and Email Confirmation
1. Go to Supabase Dashboard -> Authentication -> Providers -> Email.
2. Ensure Email provider is enabled.
3. Set `Confirm email` to **ON**.
4. Set password policy minimum length to **10+**.
5. Require stronger password format (upper/lower/digits/symbols) if plan supports custom policy controls.

## 2) Auth Rate Limits
1. Dashboard -> Authentication -> Rate limits.
2. Set conservative defaults:
- Sign in/sign up: 20 per 5 minutes per IP
- OTP/token verifications: 20 per 5 minutes per IP
- Email sends: keep low (2 per hour baseline, increase only as needed)

## 3) CAPTCHA / Bot Protection
1. Dashboard -> Authentication -> Bot Detection.
2. Enable CAPTCHA provider (Cloudflare Turnstile recommended).
3. Configure secret and site key in hosted project settings.
4. Validate signup and magic-link flows still succeed.

## 4) SMTP (Production)
Configure a production SMTP provider in hosted Supabase (Postmark/Resend/Brevo):
- SMTP host
- SMTP port
- SMTP username
- SMTP password
- Sender email
- Sender name

Do not place SMTP credentials in frontend code.

## 5) Email Templates
Configure and test:
- Verify email
- Password reset
- Welcome/first-login

## 6) Deliverability Baseline
At your sending domain DNS:
- SPF record includes your SMTP provider
- DKIM enabled and validated
- DMARC published (`p=none` initially, then tighten)

## 7) Validation Checklist
1. Create new user -> verify email is required before login.
2. Trigger reset password email.
3. Attempt repeated signup requests from same IP and verify throttling.
4. Confirm no auth secrets in browser network payloads or logs.

## 8) Environment Notes
- Local parity is tracked in `supabase/config.toml`.
- Frontend captcha requires both `VITE_TURNSTILE_ENABLED=true` and a valid `VITE_TURNSTILE_SITE_KEY` (or `VITE_AUTH_TURNSTILE_SITE_KEY`).
- Local Supabase CLI reads the captcha secret from `SUPABASE_AUTH_CAPTCHA_SECRET`.
- Hosted dashboard remains source of truth for production auth behavior.

## 9) Windows Local Setup
Use this PowerShell sequence to set the local captcha secret without echoing it back into the terminal history as plain text input:

```powershell
$secure = Read-Host "Enter SUPABASE_AUTH_CAPTCHA_SECRET" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
	$secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
	[Environment]::SetEnvironmentVariable("SUPABASE_AUTH_CAPTCHA_SECRET", $secret, "User")
	$env:SUPABASE_AUTH_CAPTCHA_SECRET = $secret
} finally {
	if ($ptr -ne [IntPtr]::Zero) {
		[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
	}
}

Set-Location C:\Users\raysc\AFinalChapter
npm run auth:check-env
supabase.exe stop
supabase.exe start
```

If you only want a session-scoped secret instead of persisting it to your user profile:

```powershell
$env:SUPABASE_AUTH_CAPTCHA_SECRET = Read-Host "Enter SUPABASE_AUTH_CAPTCHA_SECRET"
Set-Location C:\Users\raysc\AFinalChapter
npm run auth:check-env
supabase.exe stop
supabase.exe start
```

## 10) Operator Checklist
- See [docs/SUPABASE_TURNSTILE_VERIFICATION_CHECKLIST.md](docs/SUPABASE_TURNSTILE_VERIFICATION_CHECKLIST.md) for the end-to-end hosted/local verification flow.
