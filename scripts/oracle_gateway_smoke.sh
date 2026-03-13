#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

BASE_URL="$(grep -E '^ORACLE_API_BASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
API_KEY="$(grep -E '^ORACLE_API_KEY=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"

if [[ -z "$BASE_URL" || -z "$API_KEY" ]]; then
  echo "ORACLE_API_BASE_URL or ORACLE_API_KEY missing in .env"
  exit 1
fi

echo "[1/3] Oracle health"
curl -fsS -m 20 "$BASE_URL/health"
echo

echo "[2/3] Oracle protected route with x-api-key only (expect missing_authorization)"
HTTP2=$(curl -sS -m 20 -o /tmp/oracle_smoke_2.json -w '%{http_code}' -X POST "$BASE_URL/admin/contacts/merge/preview" \
  -H "x-api-key: $API_KEY" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"00000000-0000-0000-0000-000000000000","from_contact_id":"00000000-0000-0000-0000-000000000001","into_contact_id":"00000000-0000-0000-0000-000000000002"}')
cat /tmp/oracle_smoke_2.json
echo
if ! rg -q 'missing_authorization' /tmp/oracle_smoke_2.json; then
  echo "Unexpected response in step 2 (http=$HTTP2)"
  exit 1
fi

echo "[3/3] Netlify proxy call (expect missing_authorization)"
HTTP3=$(curl -sS -m 20 -o /tmp/oracle_smoke_3.json -w '%{http_code}' -X POST "https://goclearonline.cc/.netlify/functions/admin-merge-preview" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"00000000-0000-0000-0000-000000000000","from_contact_id":"00000000-0000-0000-0000-000000000001","into_contact_id":"00000000-0000-0000-0000-000000000002"}')
cat /tmp/oracle_smoke_3.json
echo
if ! rg -q 'missing_authorization' /tmp/oracle_smoke_3.json; then
  echo "Unexpected response in step 3 (http=$HTTP3)"
  exit 1
fi

echo "Smoke checks completed."
