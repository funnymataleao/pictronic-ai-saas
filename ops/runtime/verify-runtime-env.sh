#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_ENV_FILE="${PICTRONIC_RUNTIME_ENV_FILE:-${ROOT_DIR}/.env.runtime}"

if [[ -f "${ROOT_DIR}/.env.local" ]]; then
  QUARANTINE_DIR="${ROOT_DIR}/docs/e2e/.env-quarantine"
  mkdir -p "${QUARANTINE_DIR}"
  QUARANTINE_PATH="${QUARANTINE_DIR}/.env.local.$(date -u +%Y%m%dT%H%M%SZ)"
  mv "${ROOT_DIR}/.env.local" "${QUARANTINE_PATH}"
  echo "runtime env check: quarantined .env.local -> ${QUARANTINE_PATH}" >&2
fi

if [[ -f "${RUNTIME_ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${RUNTIME_ENV_FILE}"
  set +a
fi

require_any() {
  local key_a="$1"
  local key_b="$2"
  if [[ -n "${!key_a:-}" || -n "${!key_b:-}" ]]; then
    return 0
  fi
  echo "ERROR: missing required env var: ${key_a} or ${key_b}" >&2
  return 1
}

require_any "NEXT_PUBLIC_SUPABASE_URL" "SUPABASE_URL"
require_any "NEXT_PUBLIC_SUPABASE_ANON_KEY" "SUPABASE_ANON_KEY"
require_any "SUPABASE_SERVICE_ROLE_KEY" "SUPABASE_SERVICE_KEY"

echo "runtime env check: OK"
