#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
BOOTSTRAP_KEY="${BRIDGE_BOOTSTRAP_KEY:-bridge-bootstrap-dev}"
MACHINE_ID="${MACHINE_ID:-bridge-auth-check-$(date -u +%s)}"

register_json="$(mktemp)"
poll_headers="$(mktemp)"
poll_json="$(mktemp)"
trap 'rm -f "$register_json" "$poll_headers" "$poll_json"' EXIT

curl -sS -X POST "${BASE_URL}/api/bridge/nodes/register" \
  -H "content-type: application/json" \
  -H "x-bridge-bootstrap-key: ${BOOTSTRAP_KEY}" \
  --data "{\"machineId\":\"${MACHINE_ID}\",\"capabilities\":[\"comfyui\",\"ollama\"]}" > "${register_json}"

node_id="$(jq -r '.data.node.nodeId // empty' "${register_json}")"
token="$(jq -r '.data.connectionToken.token // empty' "${register_json}")"
if [[ -z "${node_id}" || -z "${token}" ]]; then
  echo "register response missing nodeId/token" >&2
  cat "${register_json}" >&2
  exit 1
fi

curl -sS -D "${poll_headers}" -o "${poll_json}" -X POST "${BASE_URL}/api/bridge/nodes/${node_id}/poll" \
  -H "content-type: application/json" \
  -H "authorization: Bearer ${token}" \
  --data "{\"machineId\":\"${MACHINE_ID}\",\"capabilities\":[\"comfyui\",\"ollama\"],\"leaseTtlSeconds\":30}"

status_line="$(head -n 1 "${poll_headers}")"
if ! grep -q " 200 " <<<"${status_line}"; then
  echo "poll did not return 200: ${status_line}" >&2
  cat "${poll_json}" >&2
  exit 1
fi

ok_value="$(jq -r '.ok // false' "${poll_json}")"
if [[ "${ok_value}" != "true" ]]; then
  echo "poll response ok=false" >&2
  cat "${poll_json}" >&2
  exit 1
fi

echo "bridge auth check: OK nodeId=${node_id}"
