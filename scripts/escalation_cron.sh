#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${ORACLE_API_BASE_URL:-http://127.0.0.1:${PORT:-3000}}"
RUN_LIMIT="${ESCALATION_RUN_LIMIT:-50}"
TENANTS_RAW="${ORACLE_TENANT_IDS:-}"
INTERNAL_KEY="${INTERNAL_API_KEY:-}"
CRON_TOKEN="${ORACLE_CRON_TOKEN:-}"

log_json() {
  local level="$1"
  local tenant_id="$2"
  local status_code="$3"
  local message="$4"
  local body="$5"

  printf '{"ts":"%s","runner":"escalation","level":"%s","tenant_id":"%s","status_code":"%s","message":"%s","response":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$level" \
    "$tenant_id" \
    "$status_code" \
    "${message//\"/\\\"}" \
    "$body"
}

if [[ -z "$INTERNAL_KEY" ]]; then
  log_json "error" "" "" "missing INTERNAL_API_KEY" '""'
  exit 1
fi

if [[ -z "$CRON_TOKEN" ]]; then
  log_json "error" "" "" "missing ORACLE_CRON_TOKEN" '""'
  exit 1
fi

if [[ -z "$TENANTS_RAW" ]]; then
  log_json "error" "" "" "missing ORACLE_TENANT_IDS" '""'
  exit 1
fi

IFS=',' read -r -a TENANTS <<< "$TENANTS_RAW"

for raw_tenant in "${TENANTS[@]}"; do
  tenant_id="$(echo "$raw_tenant" | xargs)"
  if [[ -z "$tenant_id" ]]; then
    continue
  fi

  payload=$(printf '{"tenant_id":"%s","limit":%s}' "$tenant_id" "$RUN_LIMIT")
  tmp_file=$(mktemp)

  http_code=$(curl -sS \
    --max-time 30 \
    -o "$tmp_file" \
    -w "%{http_code}" \
    -X POST "${BASE_URL}/admin/escalation/run" \
    -H 'content-type: application/json' \
    -H "x-api-key: ${INTERNAL_KEY}" \
    -H "x-cron-token: ${CRON_TOKEN}" \
    --data "$payload" || true)

  response_body=$(cat "$tmp_file" 2>/dev/null || echo '{}')
  rm -f "$tmp_file"

  if [[ "$http_code" =~ ^2 ]]; then
    log_json "info" "$tenant_id" "$http_code" "escalation runner call succeeded" "${response_body:-{}}"
  else
    log_json "error" "$tenant_id" "$http_code" "escalation runner call failed" "${response_body:-{}}"
  fi

done
