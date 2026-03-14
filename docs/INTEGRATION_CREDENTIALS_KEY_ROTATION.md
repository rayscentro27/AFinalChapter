# Integration Credentials Key Rotation Runbook

## Scope
This runbook rotates encryption keys for `tenant_integrations.credentials` without schema changes or downtime.

## Env vars
- `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY`: primary encryption secret (legacy-compatible path).
- `INTEGRATION_CREDENTIALS_ENCRYPTION_ACTIVE_KID`: key id stamped into new encrypted envelopes.
- `INTEGRATION_CREDENTIALS_ENCRYPTION_KEYRING`: JSON object of `{ "kid": "secret" }` for decrypt fallback and phased rollouts.
- `INTEGRATION_CREDENTIALS_ENCRYPTION_PREVIOUS_KEY`: optional temporary read fallback for legacy rows.

## Envelope behavior
New writes include:
- `__enc_v`
- `alg`
- `kid`
- `iv`
- `tag`
- `data`

Decrypt tries keys in safe order:
1. Envelope `kid` match from keyring.
2. Active write key.
3. Primary key (`INTEGRATION_CREDENTIALS_ENCRYPTION_KEY`).
4. `INTEGRATION_CREDENTIALS_ENCRYPTION_PREVIOUS_KEY`.
5. Remaining keys in keyring.

## Rotation procedure (no downtime)
1. Generate new strong secret.
2. Add new key to `INTEGRATION_CREDENTIALS_ENCRYPTION_KEYRING` alongside current key.
3. Set `INTEGRATION_CREDENTIALS_ENCRYPTION_ACTIVE_KID` to the new key id.
4. Keep previous key available in either keyring or `INTEGRATION_CREDENTIALS_ENCRYPTION_PREVIOUS_KEY`.
5. Deploy functions with updated env only.
6. Validate integration flows:
   - `POST /.netlify/functions/integration_upsert`
   - `POST /.netlify/functions/integration_test`
   - `GET /.netlify/functions/integration_list`
7. Optionally re-save/retest integrations to re-encrypt under the new key id.
8. After rotation window, remove old key material and redeploy.

## Rollback
1. Restore old `INTEGRATION_CREDENTIALS_ENCRYPTION_ACTIVE_KID` and key values.
2. Redeploy env.
3. Re-run integration endpoint checks.

## Safety notes
- Never expose any encryption env var as `VITE_*`.
- Keep secrets only in Netlify/secure server env stores.
- Rotate keys with documented change windows and operator sign-off.
