#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_USER="${ORACLE_TARGET_USER:-ubuntu}"
REMOTE_APP_DIR="${ORACLE_APP_DIR:-/opt/nexus-api}"
REMOTE_GATEWAY_DIR="${REMOTE_APP_DIR}/gateway"
REMOTE_BACKUP_ROOT="${ORACLE_BACKUP_ROOT:-/home/${TARGET_USER}/backups/nexus-api}"
REMOTE_INSTALL_CMD="${ORACLE_REMOTE_INSTALL_CMD:-npm ci --omit=dev}"
REMOTE_SERVICE_NAME="${ORACLE_SERVICE_NAME:-nexus-api}"
RELEASE_SHA="${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD 2>/dev/null || echo local)}"
RELEASE_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_ID="${RELEASE_STAMP}-${RELEASE_SHA}"

if [[ ! -d "$REPO_ROOT/gateway" ]]; then
  echo "Missing gateway directory under $REPO_ROOT" >&2
  exit 1
fi

for cmd in git tar bash; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

REMOTE_SCRIPT="$(cat <<EOF
set -euo pipefail

release_id='${RELEASE_ID}'
remote_app_dir='${REMOTE_APP_DIR}'
remote_gateway_dir='${REMOTE_GATEWAY_DIR}'
remote_backup_root='${REMOTE_BACKUP_ROOT}'
remote_service_name='${REMOTE_SERVICE_NAME}'
remote_install_cmd='${REMOTE_INSTALL_CMD}'
deploy_tmp_dir="\${remote_app_dir}/.deploy-\${release_id}"
backup_dir="\${remote_backup_root}/\${release_id}"
release_file="\${remote_gateway_dir}/.deploy-release.json"
env_stash="\${remote_app_dir}/.deploy-env-\${release_id}"

mkdir -p "\${remote_app_dir}" "\${remote_backup_root}"
rm -rf "\${deploy_tmp_dir}"
mkdir -p "\${deploy_tmp_dir}"

if [[ -f "\${remote_gateway_dir}/.env" ]]; then
  cp "\${remote_gateway_dir}/.env" "\${env_stash}"
fi

if [[ -d "\${remote_gateway_dir}" ]]; then
  rm -rf "\${backup_dir}"
  mkdir -p "\${backup_dir}"
  cp -a "\${remote_gateway_dir}" "\${backup_dir}/gateway"
fi

tar -xzf - -C "\${deploy_tmp_dir}"
rm -rf "\${remote_gateway_dir}"
mv "\${deploy_tmp_dir}/gateway" "\${remote_gateway_dir}"

if [[ -f "\${env_stash}" ]]; then
  mv "\${env_stash}" "\${remote_gateway_dir}/.env"
fi

cd "\${remote_gateway_dir}"
eval "\${remote_install_cmd}"

cat > "\${release_file}" <<JSON
{
  "release_id": "\${release_id}",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "service": "\${remote_service_name}"
}
JSON

sudo systemctl restart "\${remote_service_name}"
sudo systemctl is-active "\${remote_service_name}" >/dev/null
sudo systemctl status "\${remote_service_name}" --no-pager --lines=12
test -f "\${remote_gateway_dir}/src/routes/admin_credentials.js"
echo "DEPLOY_RELEASE=\${release_id}"
echo "DEPLOY_BACKUP=\${backup_dir}"

rm -rf "\${deploy_tmp_dir}"
EOF
)"

echo "Deploying gateway release ${RELEASE_ID} to ${REMOTE_GATEWAY_DIR} via OCI Bastion"

tar -C "$REPO_ROOT" \
  --exclude='gateway/node_modules' \
  --exclude='gateway/.env' \
  --exclude='gateway/.env.local' \
  --exclude='gateway/.env.*.local' \
  -czf - gateway | \
  bash "$REPO_ROOT/scripts/oracle_quickconnect.sh" "$TARGET_USER" bash -lc "$REMOTE_SCRIPT"