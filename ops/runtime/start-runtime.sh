#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_PORT="${PICTRONIC_RUNTIME_PORT:-3000}"
RUNTIME_HOST="${PICTRONIC_RUNTIME_HOST:-127.0.0.1}"

bash "${ROOT_DIR}/ops/runtime/verify-runtime-env.sh"

if ss -ltn "( sport = :${RUNTIME_PORT} )" | tail -n +2 | rg -q .; then
  echo "runtime startup guard: port ${RUNTIME_PORT} is already in use; refusing Next.js fallback port shift" >&2
  exit 64
fi

cd "${ROOT_DIR}"
exec npx next dev --hostname "${RUNTIME_HOST}" --port "${RUNTIME_PORT}"
