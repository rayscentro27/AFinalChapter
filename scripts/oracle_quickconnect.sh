#!/usr/bin/env bash
set -euo pipefail

# Deterministic Oracle Bastion connect helper for AFinalChapter.
# Default target user is ubuntu (sudo works on current VM).

PROFILE="${OCI_PROFILE:-goclearonline}"
REGION="${OCI_REGION:-us-phoenix-1}"
BASTION_ID="${OCI_BASTION_ID:-ocid1.bastion.oc1.phx.amaaaaaagei26sya7xmdyfexxw3umt7j4dnfgqgkw3oi2z6t6vegpb4ja7hq}"
INSTANCE_ID="${OCI_INSTANCE_ID:-ocid1.instance.oc1.phx.anyhqljtgei26sycw3q6j2kj3siwqxylieleq3r76eahyc3eeu5thna2hlaq}"
TARGET_IP="${OCI_TARGET_IP:-10.0.0.70}"
TARGET_USER="${1:-ubuntu}"
PRINT_ONLY="${PRINT_ONLY:-0}"
DELETE_ON_EXIT="${DELETE_ON_EXIT:-1}"

if ! command -v oci >/dev/null 2>&1; then
  echo "oci CLI is required" >&2
  exit 1
fi
if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required" >&2
  exit 1
fi

TS="$(date +%Y%m%d%H%M%S)"
KEY_FILE="/tmp/bastion_session_key_${TARGET_USER}_${TS}"
DISPLAY_NAME="afinal-openchatai-${TARGET_USER}-${TS}"
HOST="host.bastion.${REGION}.oci.oraclecloud.com"

cleanup() {
  if [[ "${DELETE_ON_EXIT}" == "1" && -n "${SESSION_ID:-}" ]]; then
    oci bastion session delete --session-id "$SESSION_ID" --force --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1 || true
  fi
  rm -f "$KEY_FILE" "$KEY_FILE.pub"
}
trap cleanup EXIT

ssh-keygen -t ed25519 -N '' -f "$KEY_FILE" -C "bastion-${TARGET_USER}-${TS}" >/dev/null

SESSION_ID="$(oci bastion session create-managed-ssh \
  --bastion-id "$BASTION_ID" \
  --region "$REGION" \
  --profile "$PROFILE" \
  --display-name "$DISPLAY_NAME" \
  --ssh-public-key-file "$KEY_FILE.pub" \
  --target-resource-id "$INSTANCE_ID" \
  --target-os-username "$TARGET_USER" \
  --target-port 22 \
  --session-ttl 10800 \
  --query 'data.id' --raw-output 2>/dev/null)"

if [[ -z "$SESSION_ID" || "$SESSION_ID" == "null" ]]; then
  echo "Failed to create bastion session" >&2
  exit 1
fi

STATE=""
for _ in $(seq 1 45); do
  STATE="$(oci bastion session get --session-id "$SESSION_ID" --region "$REGION" --profile "$PROFILE" --query 'data."lifecycle-state"' --raw-output 2>/dev/null || true)"
  if [[ "$STATE" == "ACTIVE" ]]; then
    break
  fi
  sleep 2
done

if [[ "$STATE" != "ACTIVE" ]]; then
  echo "Session $SESSION_ID did not become ACTIVE (state=${STATE:-unknown})" >&2
  exit 1
fi

SSH_CMD=(
  ssh
  -i "$KEY_FILE"
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
  -o "ProxyCommand=ssh -i $KEY_FILE -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -W %h:%p -p 22 ${SESSION_ID}@${HOST}"
  -p 22
  "${TARGET_USER}@${TARGET_IP}"
)

echo "session_id=$SESSION_ID"
echo "target=${TARGET_USER}@${TARGET_IP}"
echo "ssh_command=${SSH_CMD[*]}"

if [[ "$PRINT_ONLY" == "1" ]]; then
  exit 0
fi

"${SSH_CMD[@]}"
