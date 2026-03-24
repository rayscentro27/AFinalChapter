# Oracle CI Secret Checklist

Last updated: 2026-03-24

This checklist is the exact setup and first-run verification sequence for the Bastion-based Oracle deploy workflow in `.github/workflows/deploy-api-oracle.yml`.

Current repo status at the time this was written:
- `gh secret list --repo rayscentro27/AFinalChapter` returned `no secrets found`
- that means the workflow cannot currently succeed in CI until secrets are added

## Required GitHub Secrets

These are required because the workflow exits early if any are missing.

1. `OCI_REGION`
   - current value should be `us-phoenix-1`
2. `OCI_USER_OCID`
   - source: OCI user used by the `goclearonline` CLI profile
3. `OCI_TENANCY_OCID`
   - source: OCI tenancy OCID from the same profile
4. `OCI_FINGERPRINT`
   - source: API key fingerprint from the same profile
5. `OCI_API_KEY_CONTENT`
   - source: the full PEM private key content that matches the fingerprint above
6. `SMOKE_TENANT_ID`
   - recommended current tenant: `ff88f4f5-1e15-4773-8093-ff0e95cfa9d6`
7. `SUPABASE_URL`
   - source: production Supabase project URL
8. `SUPABASE_SERVICE_ROLE_KEY`
   - source: production service-role key

## Optional GitHub Secrets

These are optional because the repo has pinned defaults in `scripts/oracle_quickconnect.sh`, but you should still set them so CI does not depend on hardcoded OCIDs.

1. `OCI_BASTION_ID`
2. `OCI_INSTANCE_ID`
3. `OCI_TARGET_IP`

## Recommended Source Of Truth

Use the working local environment that already succeeded in WSL as the source for OCI values.

Map them like this:
- `OCI_REGION` from the `goclearonline` profile region
- `OCI_USER_OCID` from `~/.oci/config`
- `OCI_TENANCY_OCID` from `~/.oci/config`
- `OCI_FINGERPRINT` from `~/.oci/config`
- `OCI_API_KEY_CONTENT` from the PEM file referenced by `key_file`
- `OCI_BASTION_ID`, `OCI_INSTANCE_ID`, `OCI_TARGET_IP` from the proven Bastion path already baked into `scripts/oracle_quickconnect.sh`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the same production values currently used by gateway smoke tooling

## Audit Command

Run this from repo root to see what is still missing:

```bash
scripts/oracle_ci_secret_audit.sh
```

It prints:
- required secrets
- optional secrets
- exact `gh secret set` command templates for anything still missing

## Example Secret Set Commands

These are the exact command shapes to use.

```bash
printf '%s' 'us-phoenix-1' | gh secret set OCI_REGION --repo rayscentro27/AFinalChapter
printf '%s' '<OCI_USER_OCID>' | gh secret set OCI_USER_OCID --repo rayscentro27/AFinalChapter
printf '%s' '<OCI_TENANCY_OCID>' | gh secret set OCI_TENANCY_OCID --repo rayscentro27/AFinalChapter
printf '%s' '<OCI_FINGERPRINT>' | gh secret set OCI_FINGERPRINT --repo rayscentro27/AFinalChapter
printf '%s' '<PEM_CONTENT>' | gh secret set OCI_API_KEY_CONTENT --repo rayscentro27/AFinalChapter
printf '%s' 'ff88f4f5-1e15-4773-8093-ff0e95cfa9d6' | gh secret set SMOKE_TENANT_ID --repo rayscentro27/AFinalChapter
printf '%s' '<SUPABASE_URL>' | gh secret set SUPABASE_URL --repo rayscentro27/AFinalChapter
printf '%s' '<SUPABASE_SERVICE_ROLE_KEY>' | gh secret set SUPABASE_SERVICE_ROLE_KEY --repo rayscentro27/AFinalChapter
```

Optional overrides:

```bash
printf '%s' '<OCI_BASTION_ID>' | gh secret set OCI_BASTION_ID --repo rayscentro27/AFinalChapter
printf '%s' '<OCI_INSTANCE_ID>' | gh secret set OCI_INSTANCE_ID --repo rayscentro27/AFinalChapter
printf '%s' '<OCI_TARGET_IP>' | gh secret set OCI_TARGET_IP --repo rayscentro27/AFinalChapter
```

## First-Run Dry-Run Sequence

Do this in order.

1. Verify local CLI auth

```bash
gh auth status
bash scripts/cli-check.sh
```

2. Audit secret coverage

```bash
bash scripts/oracle_ci_secret_audit.sh
```

Expected result:
- every required secret shows `[present]`

3. Run a repo-local syntax pass before CI

```bash
bash -n scripts/oracle_quickconnect.sh scripts/oracle_bastion_deploy.sh scripts/oracle_bastion_rollback.sh scripts/oracle_protected_smoke.sh
```

4. Trigger the workflow manually instead of waiting for a production push

```bash
gh workflow run deploy-api-oracle.yml --repo rayscentro27/AFinalChapter
gh run watch --repo rayscentro27/AFinalChapter
```

Expected result:
- the workflow gets past `Validate required secrets`
- the workflow gets past `Build OCI config`
- the workflow reaches `Deploy gateway over OCI Bastion`
- the workflow reaches `Protected production smoke`

5. Verify the deploy result explicitly after CI reports success

```bash
SMOKE_TENANT_ID=ff88f4f5-1e15-4773-8093-ff0e95cfa9d6 bash scripts/oracle_protected_smoke.sh
```

6. Verify the release marker on-host

```bash
scripts/oracle_quickconnect.sh ubuntu cat /opt/nexus-api/gateway/.deploy-release.json
```

Expected result:
- the file exists
- `release_id` matches the recent CI deployment window

## Failure Triage

If the workflow fails in:

1. `Validate required secrets`
   - one or more GitHub secrets are still missing or empty

2. `Build OCI config`
   - OCI key content or OCI identifiers are malformed

3. `Deploy gateway over OCI Bastion`
   - Bastion/instance IDs or target IP are wrong, or OCI permissions drifted

4. `Protected production smoke`
   - deploy reached Oracle, but the protected app path is still broken or Supabase smoke credentials are wrong

## Required Follow-Through

After the first successful run:
- keep `scripts/oracle_ci_secret_audit.sh` as the standard preflight before changing the workflow
- do not remove the protected smoke step from CI
- treat a missing-secret workflow failure as a deployment blocker, not a warning