# Oracle Deploy Runner Setup

Last updated: 2026-03-24

This document defines the expected GitHub Actions runner for Oracle gateway deploys.

For the canonical supported execution path and recovery order, use [docs/ORACLE_CANONICAL_DEPLOY_PATH.md](docs/ORACLE_CANONICAL_DEPLOY_PATH.md).

## Goal

Run the Oracle Bastion deploy workflow from a machine that already has stable OCI connectivity instead of relying on `ubuntu-latest`.

## Required Runner Labels

Register the runner with both labels:

1. `self-hosted`
2. `oracle-deploy-wsl`

The workflow `.github/workflows/deploy-api-oracle.yml` now targets those labels for:
- `push` deploys on `main`
- default manual `workflow_dispatch` deploys

## Recommended Host

Use the machine that already proves the Bastion path works locally.

Good candidates:
- the Ubuntu WSL environment already using the working `goclearonline` OCI profile
- a dedicated admin box with stable outbound access to OCI Bastion

Avoid using a runner host that depends on the same failing network path as GitHub-hosted runners.

## Required Software

The runner host must provide:

1. Windows with `wsl.exe`
2. Ubuntu WSL with `bash`
3. Ubuntu WSL with `ssh`
4. Ubuntu WSL with `tar`
5. Ubuntu WSL with Node.js 20+
6. Ubuntu WSL with `npm`
7. Ubuntu WSL with Python 3.11+
8. Ubuntu WSL with a working `oci` CLI and `~/.oci/config`

The self-hosted workflow now shells into Ubuntu WSL for OCI access, deploy, and smoke. Do not rely on the Windows service account to build OCI config or call OCI APIs directly.

## Runner Registration Notes

Register the runner at the repository level for `rayscentro27/AFinalChapter`.

During registration:
- keep the default `self-hosted` label
- add `oracle-deploy-wsl`
- keep the runner online during production deploy windows

## First Validation

After registering the runner:

1. Start the runner service or runner process.
2. Confirm GitHub shows the runner as idle and online.
3. Trigger the workflow manually:

```bash
gh workflow run deploy-api-oracle.yml --repo rayscentro27/AFinalChapter -f runner=self-hosted
gh run watch --repo rayscentro27/AFinalChapter
```

4. Confirm the job logs show the self-hosted runner name in `Runner preflight`.
5. Confirm the `WSL preflight` step reports the Ubuntu environment and toolchain.
6. Confirm the deploy reaches protected smoke.

## Hosted Fallback

The workflow still supports manual GitHub-hosted dispatch for diagnostics:

```bash
gh workflow run deploy-api-oracle.yml --repo rayscentro27/AFinalChapter -f runner=github-hosted
```

Use that only to test whether the hosted path has recovered. Do not rely on it for the primary production deploy path until OCI Bastion session creation succeeds consistently there.