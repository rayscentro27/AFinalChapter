#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_USER="${ORACLE_TARGET_USER:-ubuntu}"
REMOTE_APP_DIR="${ORACLE_APP_DIR:-/opt/nexus-api}"
REMOTE_GATEWAY_DIR="${REMOTE_APP_DIR}/gateway"
REMOTE_BACKUP_ROOT="${ORACLE_BACKUP_ROOT:-/home/${TARGET_USER}/backups/nexus-api}"
REMOTE_SERVICE_NAME="${ORACLE_SERVICE_NAME:-nexus-api}"
ROLLBACK_RELEASE="${1:-${ORACLE_ROLLBACK_RELEASE:-latest}}"

REMOTE_SCRIPT="$(cat <<EOF
set -euo pipefail

rollback_release='${ROLLBACK_RELEASE}'
remote_gateway_dir='${REMOTE_GATEWAY_DIR}'
remote_backup_root='${REMOTE_BACKUP_ROOT}'
remote_service_name='${REMOTE_SERVICE_NAME}'

if [[ ! -d "\${remote_backup_root}" ]]; then
  echo "Missing backup root: \${remote_backup_root}" >&2
  exit 1
fi

if [[ "\${rollback_release}" == 'latest' ]]; then
  rollback_release="$(ls -1 "\${remote_backup_root}" | sort | tail -n 1)"
fi

if [[ -z "\${rollback_release}" ]]; then
  echo 'No rollback release available' >&2
  exit 1
fi

backup_gateway_dir="\${remote_backup_root}/\${rollback_release}/gateway"
if [[ ! -d "\${backup_gateway_dir}" ]]; then
  echo "Missing backup directory: \${backup_gateway_dir}" >&2
  exit 1
fi

rm -rf "\${remote_gateway_dir}"
cp -a "\${backup_gateway_dir}" "\${remote_gateway_dir}"
sudo systemctl restart "\${remote_service_name}"
sudo systemctl is-active "\${remote_service_name}" >/dev/null
sudo systemctl status "\${remote_service_name}" --no-pager --lines=12
echo "ROLLBACK_RELEASE=\${rollback_release}"
EOF
)"

echo "Rolling back gateway from ${REMOTE_BACKUP_ROOT} using release ${ROLLBACK_RELEASE}"
"$REPO_ROOT/scripts/oracle_quickconnect.sh" "$TARGET_USER" bash -lc "$REMOTE_SCRIPT"