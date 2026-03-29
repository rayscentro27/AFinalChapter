#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} == "" || ${2:-} == "" ]]; then
  echo "Usage: $0 <oracle_base_url> <oracle_api_key>"
  exit 1
fi

BASE_URL="$1"
API_KEY="$2"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

update_or_append() {
  local file="$1"
  local key="$2"
  local value="$3"

  if [[ ! -f "$file" ]]; then
    return 0
  fi

  if rg -q "^${key}=" "$file"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$file"
  else
    printf "%s=%s\n" "$key" "$value" >> "$file"
  fi
}

update_or_append "$ROOT_DIR/.env" "ORACLE_API_BASE_URL" "$BASE_URL"
update_or_append "$ROOT_DIR/.env" "ORACLE_API_KEY" "$API_KEY"

update_or_append "$ROOT_DIR/.netlify/.env" "ORACLE_API_BASE_URL" "$BASE_URL"
update_or_append "$ROOT_DIR/.netlify/.env" "ORACLE_API_KEY" "$API_KEY"
update_or_append "$ROOT_DIR/.netlify/.env" "ORACLE_BASE_URL" "$BASE_URL"
update_or_append "$ROOT_DIR/.netlify/.env" "ORACLE_INTERNAL_API_KEY" "$API_KEY"

if command -v netlify >/dev/null 2>&1; then
  netlify env:set ORACLE_API_BASE_URL "$BASE_URL" >/dev/null
  netlify env:set ORACLE_API_KEY "$API_KEY" >/dev/null
  netlify env:set ORACLE_BASE_URL "$BASE_URL" >/dev/null
  netlify env:set ORACLE_INTERNAL_API_KEY "$API_KEY" >/dev/null
fi

echo "Updated Oracle env values locally and in Netlify (if logged in)."
