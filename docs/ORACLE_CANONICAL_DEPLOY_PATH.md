# Oracle Canonical Deploy Path

Last updated: 2026-03-24

This document defines the only supported local execution path for Oracle gateway deploys on this machine.

## Canonical Path

Use the GitHub Actions self-hosted runner `raysdesktop-oracle-wsl` with labels:

1. `self-hosted`
2. `oracle-deploy-wsl`

That runner must execute the Oracle deploy workflow through Ubuntu WSL, not through the Windows service account.

## Why This Is Canonical

The older Windows service-backed runner path was rejected because:

1. plain OCI API calls timed out from the Windows `NetworkService` context
2. OCI Bastion session creation failed before SSH could start
3. the same machine's Ubuntu WSL environment already had a working OCI profile and successfully reached the Oracle VM

The WSL path is the supported path because it has already proven:

1. OCI CLI access works
2. Bastion session creation works
3. SSH to the Oracle VM works
4. workflow deploy and protected smoke both complete successfully

## Required Local State

The supported host state is:

1. Windows host with `wsl.exe`
2. Ubuntu WSL installed and accessible as distro name `Ubuntu`
3. working OCI profile at `/home/rayscentro/.oci/config`
4. working OCI key material in the same WSL home
5. repo available at `/mnt/c/Users/raysc/AFinalChapter`
6. interactive runner process `raysdesktop-oracle-wsl` online in GitHub

## Unsupported Path

Do not use these as the primary Oracle deploy path:

1. GitHub-hosted `ubuntu-latest`
2. the old Windows service-backed runner `raysdesktop-oracle-deploy`
3. Windows `NetworkService` OCI execution

## Standard Execution Flow

1. GitHub schedules the self-hosted job to `oracle-deploy-wsl`
2. the Windows runner process receives the job under the logged-in user session
3. workflow steps call `wsl.exe -d Ubuntu -- bash -lc ...`
4. Ubuntu WSL runs preflight, dependency install, Bastion deploy, and protected smoke
5. protected smoke must pass before the deploy is treated as complete

## Recovery Rules

If Oracle deploys fail again, check in this order:

1. `gh api repos/rayscentro27/AFinalChapter/actions/runners` shows only the intended WSL runner online for Oracle deploys
2. `wsl.exe -l -v` still shows `Ubuntu`
3. `wsl.exe -d Ubuntu -- bash -lc 'oci --version && test -f ~/.oci/config'`
4. the runner process `C:\Users\raysc\actions-runner-oracle-wsl\run.cmd` is still listening for jobs
5. workflow logs pass `Runner preflight` and `WSL preflight`

If the Oracle VM itself needs direct reachability validation, use:

```bash
wsl.exe -d Ubuntu -- bash -lc 'cd /mnt/c/Users/raysc/AFinalChapter && ./scripts/oracle_quickconnect.sh ubuntu hostname'
```

Expected result:

```text
openchatbot
```

## Change Control

If anyone wants to change the Oracle deploy path again, require all of the following before switching:

1. direct OCI API preflight succeeds in the new environment
2. Bastion session creation succeeds in the new environment
3. one full deploy run passes protected smoke
4. this document and the runner setup document are updated in the same change