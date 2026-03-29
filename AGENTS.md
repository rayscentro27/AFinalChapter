# AGENTS.md

## Workspace Defaults
- Canonical project path in this runtime: `/mnt/c/Users/raysc/AFinalChapter`
- If a session reports a different cwd (for example `/rayscentro27/AFinalChapter`), switch to the canonical path above.

## CLI Availability (WSL + Windows binaries)
- In this environment, Linux-native `gh` and `supabase` may be missing.
- Prefer these commands:
  - GitHub CLI: `gh.exe`
  - Supabase CLI: `supabase.exe`
  - Netlify CLI: `netlify` (Linux binary is installed)

## Quick Preflight (run at chat start)
Run this from repo root to avoid repeating setup/debug:

```sh
pwd
command -v netlify || true
command -v gh.exe || true
command -v supabase.exe || true
netlify status || true
gh.exe auth status || true
supabase.exe projects list || true
```

## Notes
- Use repo root as working directory for all project commands.
- If a command fails due to path mismatch, re-run from `/mnt/c/Users/raysc/AFinalChapter`.
