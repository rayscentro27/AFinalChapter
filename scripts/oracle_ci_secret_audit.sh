#!/usr/bin/env bash
set -euo pipefail

REPO_SLUG="${GITHUB_REPOSITORY:-rayscentro27/AFinalChapter}"
CURRENT_SMOKE_TENANT_ID="${CURRENT_SMOKE_TENANT_ID:-ff88f4f5-1e15-4773-8093-ff0e95cfa9d6}"

if command -v gh >/dev/null 2>&1; then
  GH_CMD=(gh)
elif command -v gh.exe >/dev/null 2>&1; then
  GH_CMD=(gh.exe)
else
  echo "GitHub CLI is required (gh or gh.exe)" >&2
  exit 1
fi

required=(
  OCI_REGION
  OCI_USER_OCID
  OCI_TENANCY_OCID
  OCI_FINGERPRINT
  OCI_API_KEY_CONTENT
  SMOKE_TENANT_ID
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
)

optional=(
  OCI_BASTION_ID
  OCI_INSTANCE_ID
  OCI_TARGET_IP
)

mapfile -t existing < <("${GH_CMD[@]}" secret list --repo "$REPO_SLUG" --json name --jq '.[].name' 2>/dev/null | sort)

has_secret() {
  local name="$1"
  printf '%s\n' "${existing[@]:-}" | grep -Fxq "$name"
}

print_group() {
  local heading="$1"
  shift
  echo "$heading"
  for name in "$@"; do
    if has_secret "$name"; then
      echo "  [present] $name"
    else
      echo "  [missing] $name"
    fi
  done
  echo
}

echo "Oracle CI secret audit for $REPO_SLUG"
echo
print_group "Required secrets" "${required[@]}"
print_group "Optional override secrets" "${optional[@]}"

echo "Suggested set commands"
for name in "${required[@]}" "${optional[@]}"; do
  if ! has_secret "$name"; then
    case "$name" in
      OCI_REGION)
        echo "  printf '%s' 'us-phoenix-1' | ${GH_CMD[0]} secret set $name --repo $REPO_SLUG"
        ;;
      SMOKE_TENANT_ID)
        echo "  printf '%s' '$CURRENT_SMOKE_TENANT_ID' | ${GH_CMD[0]} secret set $name --repo $REPO_SLUG"
        ;;
      *)
        echo "  printf '%s' '<VALUE>' | ${GH_CMD[0]} secret set $name --repo $REPO_SLUG"
        ;;
    esac
  fi
done