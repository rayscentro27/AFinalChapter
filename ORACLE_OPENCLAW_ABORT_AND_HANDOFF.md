# Oracle OpenClaw Abort and Handoff

## Status
This document records the Oracle-VM OpenClaw path as **intentionally aborted**.

Architecture decision (effective now):
- Oracle VM remains dedicated to Nexus API/backend.
- OpenClaw moves to a dedicated Mac Mini AI operations machine.
- Oracle-side OpenClaw install/config is paused and must not be continued.

## Attempted Command Groups (Observed)

### 1) Local/Windows OCI CLI install attempts
- `oci --version` (initially not found)
- OCI CLI PowerShell installer flow (`install.ps1`)
- Multiple retries of pip package install for `oci_cli`

### 2) OCI Cloud Shell and serial console access attempts
- Instance console connection creation/list/delete via:
  - `oci compute instance-console-connection create ...`
  - `oci compute instance-console-connection list ...`
  - `oci compute instance-console-connection delete ...`
- Serial console SSH attempts with generated keys and proxy command:
  - `ssh -tt -i ~/.ssh/oci_console... -o ProxyCommand=...`
- Repeated key rotation/cleanup attempts in Cloud Shell.

### 3) OpenClaw auth/model commands run in the wrong host context
- `openclaw models auth login --provider openai-codex --set-default`
- `openclaw models set openai-codex/gpt-5.3-codex`
- `openclaw models status --probe`
- `openclaw tui`
- In OCI Cloud Shell these returned `openclaw: command not found`.

## What Succeeded
- OCI Cloud Shell access succeeded.
- OCI serial console connection objects were created/listed/deleted.
- Serial console reached OS login prompt (`openchatbot login:`) intermittently.
- Reboot path was exercised via OCI console.
- VM stayed reachable at infrastructure level (instance running).

## What Failed / Blocked Progress
- Windows OCI CLI install failed due long-path related package extraction issues.
- Frequent operator-context confusion (Cloud Shell vs Oracle VM shell).
- Serial console authentication/interaction instability.
- Lack of usable VM shell continuity for reliable OpenClaw lifecycle operations.
- OpenClaw commands in Cloud Shell failed because OpenClaw is not installed there.

## Partial Files/Artifacts That May Exist

### Cloud Shell (`goclearonl` home)
- `~/.ssh/oci_console`
- `~/.ssh/oci_console.pub`
- `~/.ssh/oci_console_fix`
- `~/.ssh/oci_console_fix.pub`
- `~/.ssh/oci_console_new`
- `~/.ssh/oci_console_new.pub`
- `/tmp/connect_console.sh` (seen during troubleshooting)
- Temporary OCI CLI JSON files under `/tmp` (likely cleaned/ephemeral)

### Oracle VM (`ubuntu` home) (possible/previous-session artifacts)
- `/home/ubuntu/install_openclaw.sh` (bootstrap script path used in prior runs)
- `/home/ubuntu/openclaw_install.log` (install log path used in prior runs)
- Possible transient `/tmp/openclaw_install.*` artifacts from nohup/script experiments

## Node / nvm / OpenClaw State on Oracle VM
Based on prior session checks, these may be **partially installed and inconsistent**:
- `nvm` may exist in `~/.nvm`
- Node 24 may be present in at least one user context
- `openclaw` may exist in some contexts/services but should be treated as non-authoritative now

Given the architecture change, this state is now considered non-target and should not be extended.

## Handoff Note
The Oracle-VM OpenClaw path is deliberately abandoned for now due to operational instability and maintenance risk.

All future OpenClaw setup, auth, and operator automation are moved to the Mac Mini environment.
