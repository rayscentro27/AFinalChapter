#!/usr/bin/env bash
set -euo pipefail

# Usage:
# CF_API_TOKEN=<token> ./deploy/cloudflare/dns_records.sh \
#   goclearonline.cc <NETLIFY_SITE_TARGET> <ORACLE_PUBLIC_IP>

ZONE_NAME="${1:-goclearonline.cc}"
NETLIFY_TARGET="${2:-<NETLIFY_SITE_TARGET>}"   # e.g. your-site.netlify.app
ORACLE_IP="${3:-<ORACLE_PUBLIC_IP>}"

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN is required"
  exit 1
fi

cf_get() {
  local path="$1"
  curl -sS "https://api.cloudflare.com/client/v4/${path}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json"
}

cf_write() {
  local method="$1"
  local path="$2"
  local payload="$3"
  curl -sS -X "${method}" "https://api.cloudflare.com/client/v4/${path}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "${payload}"
}

ZONE_ID="$(cf_get "zones?name=${ZONE_NAME}&status=active" | jq -r '.result[0].id')"
if [[ -z "$ZONE_ID" || "$ZONE_ID" == "null" ]]; then
  echo "Zone not found: ${ZONE_NAME}"
  exit 1
fi

echo "Using zone: ${ZONE_NAME} (${ZONE_ID})"

upsert_record() {
  local type="$1"
  local fqdn="$2"
  local content="$3"
  local proxied="$4"

  local existing
  existing="$(cf_get "zones/${ZONE_ID}/dns_records?type=${type}&name=${fqdn}" | jq -r '.result[0].id')"

  local payload
  payload="$(jq -nc \
    --arg type "$type" \
    --arg name "$fqdn" \
    --arg content "$content" \
    --argjson proxied "$proxied" \
    '{type:$type,name:$name,content:$content,ttl:1,proxied:$proxied}')"

  if [[ -n "$existing" && "$existing" != "null" ]]; then
    echo "Updating ${fqdn} (${type})"
    cf_write "PUT" "zones/${ZONE_ID}/dns_records/${existing}" "${payload}" | jq -r '.success'
  else
    echo "Creating ${fqdn} (${type})"
    cf_write "POST" "zones/${ZONE_ID}/dns_records" "${payload}" | jq -r '.success'
  fi
}

# app.goclearonline.cc -> Netlify CNAME
# Safe default: proxied=false during initial cutover.
upsert_record "CNAME" "app.${ZONE_NAME}" "${NETLIFY_TARGET}" false

# api.goclearonline.cc -> Oracle public IP
# Required for direct Let's Encrypt issuance on the VM.
upsert_record "A" "api.${ZONE_NAME}" "${ORACLE_IP}" false

echo "Done."
