# Mac Mini launchd Scaffold

These files are a starting point for running the Mac Mini worker and optional OpenClaw operator runtime under `launchd`.

Files:
- `com.nexus.mac-mini-worker.plist`
- `com.nexus.openclaw-operator.plist`
- `run-mac-mini-worker.sh.example`
- `run-openclaw.sh.example`

Recommended install flow:

1. Copy the example wrapper scripts into `~/nexus-ops/` and remove `.example` from the filename.
2. Edit the wrapper scripts for the real local username, paths, and command arguments.
3. Copy the plist files into `~/Library/LaunchAgents/`.
4. Replace `YOUR_USER` placeholders inside the plist files.
5. Load the services with `launchctl bootstrap`.

Use the recovery steps in `docs/MAC_MINI_RECOVERY_RUNBOOK_2026-03-23.md` after installation.
