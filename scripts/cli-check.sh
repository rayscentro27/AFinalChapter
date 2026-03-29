#!/usr/bin/env bash
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OCI_PROFILE="${OCI_PROFILE:-goclearonline}"
NETLIFY_ENV="NETLIFY_CLI_SKIP_UPDATE_CHECK=1 NETLIFY_CLI_TELEMETRY_DISABLED=1"

FAILURES=0

print_ok() {
  printf "[OK] %s\n" "$1"
}

print_fail() {
  printf "[FAIL] %s\n" "$1"
  FAILURES=$((FAILURES + 1))
}

command_ready() {
  command -v "$1" >/dev/null 2>&1
}

check_gh() {
  if ! command_ready gh; then
    print_fail "gh not installed"
    return
  fi

  if ! gh auth status >/dev/null 2>&1; then
    print_fail "gh installed but not authenticated"
    return
  fi

  local owner
  owner="$(cd "$REPO_ROOT" && gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
  if [[ -z "$owner" ]]; then
    print_fail "gh authenticated but this directory is not linked to a default repo"
    return
  fi

  print_ok "gh connected ($owner)"
}

check_supabase() {
  if ! command_ready supabase; then
    print_fail "supabase not installed"
    return
  fi

  local ref_file ref
  ref_file="$REPO_ROOT/supabase/.temp/project-ref"
  if [[ ! -f "$ref_file" ]]; then
    print_fail "supabase installed but project ref missing at supabase/.temp/project-ref"
    return
  fi
  ref="$(cat "$ref_file")"

  if ! supabase projects list >/dev/null 2>&1; then
    print_fail "supabase installed but authentication check failed"
    return
  fi

  print_ok "supabase connected (project-ref: $ref)"
}

check_netlify() {
  if ! command_ready netlify; then
    print_fail "netlify not installed"
    return
  fi

  local status site_id site_name
  status="$(cd "$REPO_ROOT" && env $NETLIFY_ENV netlify status --json 2>/dev/null || true)"
  site_id="$(printf "%s" "$status" | sed -n "s/.*\"site-id\": \"\(.*\)\".*/\1/p" | head -n1)"
  site_name="$(printf "%s" "$status" | sed -n "s/.*\"site-name\": \"\(.*\)\".*/\1/p" | head -n1)"

  if [[ -z "$site_id" || -z "$site_name" ]]; then
    print_fail "netlify installed but status check failed (not authenticated or not linked)"
    return
  fi

  print_ok "netlify connected ($site_name / $site_id)"
}

check_stripe() {
  if ! command_ready stripe; then
    print_fail "stripe not installed"
    return
  fi

  if ! stripe config --list >/dev/null 2>&1; then
    print_fail "stripe installed but local config is unavailable"
    return
  fi

  if ! stripe customers list --limit 1 >/dev/null 2>&1; then
    print_fail "stripe installed but authenticated API call failed"
    return
  fi

  print_ok "stripe connected (API call succeeded)"
}

check_oci() {
  if ! command_ready oci; then
    print_fail "oci not installed"
    return
  fi

  local region
  region="$(oci iam region-subscription list --all --profile "$OCI_PROFILE" --query "data[0].\"region-name\"" --raw-output 2>/dev/null || true)"
  if [[ -z "$region" ]]; then
    print_fail "oci installed but auth check failed for profile '$OCI_PROFILE'"
    return
  fi

  print_ok "oci connected (profile: $OCI_PROFILE, region: $region)"
}

check_gh
check_supabase
check_netlify
check_stripe
check_oci

if (( FAILURES > 0 )); then
  printf "\n%d check(s) failed.\n" "$FAILURES"
  exit 1
fi

printf "\nAll CLI checks passed.\n"
