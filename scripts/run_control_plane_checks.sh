#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKEN_FILE="${REPO_ROOT}/.secrets/real_user_bearer_token.txt"

if [[ ! -s "$TOKEN_FILE" ]]; then
  echo "Missing token: $TOKEN_FILE is empty. Paste Bearer token there and rerun."
  exit 1
fi

if [[ ! -f "${REPO_ROOT}/gateway/.env" ]]; then
  echo "Missing gateway/.env"
  exit 1
fi

INTERNAL_API_KEY="$(grep -E '^INTERNAL_API_KEY=' "${REPO_ROOT}/gateway/.env" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" )"
SUPABASE_URL="$(grep -E '^SUPABASE_URL=' "${REPO_ROOT}/gateway/.env" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" )"
SUPABASE_SERVICE_ROLE_KEY="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "${REPO_ROOT}/gateway/.env" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" )"

if [[ -z "$INTERNAL_API_KEY" || -z "$SUPABASE_URL" || -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
  echo "Missing required env values in gateway/.env"
  exit 1
fi

TOKEN="$(sed -n '1p' "$TOKEN_FILE" | sed -E 's/^Bearer[[:space:]]+//I' | tr -d '\r\n')"
export TOKEN

USER_ID="$(node - <<'NODE'
const token = process.env.TOKEN || '';
const parts = token.split('.');
if (parts.length < 2) { process.stdout.write(''); process.exit(0); }
const b64 = parts[1].replace(/-/g,'+').replace(/_/g,'/');
const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
try {
  const payload = JSON.parse(Buffer.from(pad, 'base64').toString('utf8'));
  process.stdout.write(String(payload.sub || ''));
} catch {
  process.stdout.write('');
}
NODE
)"

if [[ -z "$USER_ID" ]]; then
  echo "Token in $TOKEN_FILE is not a valid user JWT"
  exit 1
fi
export USER_ID
export SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY

TENANT_ID="$(node - <<'NODE'
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  let { data, error } = await sb.from('tenant_memberships').select('tenant_id').eq('user_id', process.env.USER_ID).limit(1);
  if (error) ({ data, error } = await sb.from('tenant_members').select('tenant_id').eq('user_id', process.env.USER_ID).limit(1));
  if (error) { process.stdout.write(''); process.exit(0); }
  process.stdout.write((data && data[0] && data[0].tenant_id) ? String(data[0].tenant_id) : '');
})();
NODE
)"

if [[ -z "$TENANT_ID" ]]; then
  echo "No tenant membership found for token user"
  exit 1
fi

npm run gateway:start >/tmp/nexus_gateway_run.log 2>&1 &
GW_PID=$!
cleanup(){
  if kill -0 "$GW_PID" 2>/dev/null; then
    kill "$GW_PID" 2>/dev/null || true
    wait "$GW_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

AUTH_HEADER="Authorization: Bearer $TOKEN"
API_KEY_HEADER="x-api-key: $INTERNAL_API_KEY"

curl -sS -H "$API_KEY_HEADER" -H "$AUTH_HEADER" "http://127.0.0.1:3000/api/control-plane/state?tenant_id=$TENANT_ID" | jq
curl -sS -H "$API_KEY_HEADER" -H "$AUTH_HEADER" "http://127.0.0.1:3000/api/control-plane/flags?tenant_id=$TENANT_ID&limit=20" | jq
curl -sS -H "$API_KEY_HEADER" -H "$AUTH_HEADER" "http://127.0.0.1:3000/api/control-plane/incidents?tenant_id=$TENANT_ID&status=active&limit=20" | jq
curl -sS -H "$API_KEY_HEADER" -H "$AUTH_HEADER" "http://127.0.0.1:3000/api/control-plane/audit?tenant_id=$TENANT_ID&limit=20" | jq

echo "Control plane checks completed for tenant: $TENANT_ID"
