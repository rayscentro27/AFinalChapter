# Mac Mini Recovery Runbook 2026-03-23

Purpose: restart and recovery instructions for the Mac Mini worker and OpenClaw operator runtimes.

Scope:
- `mac-mini-worker` queue runtime
- optional OpenClaw continuous operator runtime

Assumptions:
- files live under `~/nexus-ops/`
- logs live under `~/nexus-ops/logs/`
- services are loaded with `launchd` using the plist files in `deploy/mac-mini/`

## Standard Paths

- Worker root: `~/nexus-ops/mac-mini-worker`
- OpenClaw root: `~/nexus-ops/openclaw`
- Logs root: `~/nexus-ops/logs`
- LaunchAgent install location: `~/Library/LaunchAgents`

## Service Labels

- Worker: `com.nexus.mac-mini-worker`
- OpenClaw: `com.nexus.openclaw-operator`

## Quick Status Checks

### Worker

```bash
launchctl list | grep com.nexus.mac-mini-worker
tail -n 80 ~/nexus-ops/logs/mac-mini-worker.stdout.log
tail -n 80 ~/nexus-ops/logs/mac-mini-worker.stderr.log
```

### OpenClaw

```bash
launchctl list | grep com.nexus.openclaw-operator
tail -n 80 ~/nexus-ops/logs/openclaw.stdout.log
tail -n 80 ~/nexus-ops/logs/openclaw.stderr.log
```

## Restart Commands

### Worker

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.nexus.mac-mini-worker.plist 2>/dev/null || true
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nexus.mac-mini-worker.plist
launchctl kickstart -k gui/$(id -u)/com.nexus.mac-mini-worker
```

### OpenClaw

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.nexus.openclaw-operator.plist 2>/dev/null || true
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nexus.openclaw-operator.plist
launchctl kickstart -k gui/$(id -u)/com.nexus.openclaw-operator
```

## Common Incidents

### 1. Worker Missing Heartbeats

Symptoms:
- no fresh worker status in admin views
- queue depth rises while no jobs complete

Checks:
```bash
tail -n 120 ~/nexus-ops/logs/mac-mini-worker.stderr.log
tail -n 120 ~/nexus-ops/logs/mac-mini-worker.stdout.log
```

Action:
1. restart the worker service
2. verify `.env` still contains valid Supabase credentials
3. confirm the host still has internet access
4. confirm heartbeats resume within the expected interval plus one poll cycle

### 2. Jobs Stuck In Claimed State

Symptoms:
- worker was interrupted during processing
- queue items stay claimed beyond the expected lease window

Action:
1. restart the worker service
2. wait for lease expiry and automatic requeue behavior if configured
3. inspect whether the same job fails repeatedly after requeue
4. if a single handler is broken, disable that job source rather than thrashing retries

### 3. OpenClaw Runtime Fails To Start

Symptoms:
- operator service exits immediately
- stderr log shows auth or command-not-found failure

Action:
1. run the command manually from `~/nexus-ops/openclaw/run-openclaw.sh`
2. confirm the `openclaw` CLI exists on the host
3. confirm required auth or provider variables are present
4. update the wrapper script rather than editing the plist directly

## Manual Validation After Restart

### Worker

```bash
launchctl print gui/$(id -u)/com.nexus.mac-mini-worker | head -n 40
tail -n 40 ~/nexus-ops/logs/mac-mini-worker.stdout.log
```

Expected signals:
- worker start log line appears
- polling resumes
- heartbeat emission resumes

### OpenClaw

```bash
launchctl print gui/$(id -u)/com.nexus.openclaw-operator | head -n 40
tail -n 40 ~/nexus-ops/logs/openclaw.stdout.log
```

Expected signals:
- wrapper script starts cleanly
- no repeated auth prompt or crash loop

## Update Procedure

When changing worker code or wrapper scripts:

1. pull the updated repo or copy the changed files into `~/nexus-ops/`
2. restart only the affected service
3. confirm logs and heartbeat recovery
4. if behavior regresses, restore the previous script or code version and restart again

## Operator Rule

- do not edit the plist files on the host for routine command changes
- edit the wrapper scripts or the checked-in config instead
- keep the service labels and log locations stable so monitoring does not drift
