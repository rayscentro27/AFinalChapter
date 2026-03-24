#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TENANT_ID="${1:-${SMOKE_TENANT_ID:-}}"
SMOKE_ROLE="${SMOKE_ROLE:-admin}"
APP_BASE_URL="${APP_BASE_URL:-https://app.goclearonline.cc}"
FUNCTION_PATH="${ORACLE_SMOKE_FUNCTION_PATH:-/.netlify/functions/admin-credential-readiness}"
TOKEN_FILE="${SMOKE_TOKEN_FILE:-${REPO_ROOT}/.secrets/deploy_smoke_token.txt}"
META_FILE="${SMOKE_META_FILE:-${REPO_ROOT}/.secrets/deploy_smoke_meta.json}"
BODY_FILE="${SMOKE_BODY_FILE:-/tmp/oracle_protected_smoke_body.json}"
HEADER_FILE="${SMOKE_HEADER_FILE:-/tmp/oracle_protected_smoke_headers.txt}"

if [[ -z "$TENANT_ID" ]]; then
  echo "Usage: scripts/oracle_protected_smoke.sh <tenant_uuid>" >&2
  echo "Set SMOKE_TENANT_ID when running non-interactively." >&2
  exit 1
fi

cleanup() {
  node "$REPO_ROOT/scripts/cleanup_smoke_users.mjs" >/dev/null 2>&1 || true
  rm -f "$TOKEN_FILE" "$META_FILE" "$BODY_FILE" "$HEADER_FILE"
}
trap cleanup EXIT

mkdir -p "$(dirname "$TOKEN_FILE")"

node "$REPO_ROOT/scripts/provision_smoke_user_token.mjs" \
  "--tenant-id=${TENANT_ID}" \
  "--role=${SMOKE_ROLE}" \
  "--token-out=${TOKEN_FILE}" \
  "--meta-out=${META_FILE}" >/dev/null

TOKEN="$(sed -n '1p' "$TOKEN_FILE" | sed -E 's/^Bearer[[:space:]]+//I' | tr -d '\r\n')"
if [[ -z "$TOKEN" ]]; then
  echo "Provisioned smoke token is empty" >&2
  exit 1
fi

TARGET_URL="${APP_BASE_URL%/}${FUNCTION_PATH}?tenant_id=${TENANT_ID}"
HTTP_STATUS="$(curl -sS -D "$HEADER_FILE" -o "$BODY_FILE" -w '%{http_code}' \
  -H "authorization: Bearer ${TOKEN}" \
  -H 'accept: application/json' \
  "$TARGET_URL")"

CONTENT_TYPE="$(awk 'BEGIN{IGNORECASE=1} /^content-type:/ {gsub(/\r/,"",$0); sub(/^content-type:[[:space:]]*/,"",$0); print; exit}' "$HEADER_FILE")"

HTTP_STATUS="$HTTP_STATUS" CONTENT_TYPE="$CONTENT_TYPE" BODY_FILE="$BODY_FILE" node <<'NODE'
const fs = require('node:fs');

const status = Number(process.env.HTTP_STATUS || 0);
const contentType = String(process.env.CONTENT_TYPE || '').toLowerCase();
const bodyFile = process.env.BODY_FILE;
const raw = fs.readFileSync(bodyFile, 'utf8');

if (status !== 200) {
  console.error(`Protected smoke failed with HTTP ${status}`);
  process.stderr.write(raw);
  process.exit(1);
}

if (!contentType.includes('application/json')) {
  console.error(`Protected smoke returned unexpected content-type: ${contentType || 'missing'}`);
  process.stderr.write(raw);
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch (error) {
  console.error(`Protected smoke returned invalid JSON: ${error.message}`);
  process.stderr.write(raw);
  process.exit(1);
}

if (!payload || payload.ok !== true) {
  console.error('Protected smoke returned a non-ok payload');
  process.stderr.write(`${raw}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  tenant_id: payload.tenant_id || null,
  overall_status: payload.summary?.overall_status || null,
})}\n`);
NODE