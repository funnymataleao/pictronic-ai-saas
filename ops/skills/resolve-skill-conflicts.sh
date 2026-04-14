#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_SKILLS_DIR="${LOCAL_SKILLS_DIR:-${ROOT_DIR}/.agents/skills}"
GLOBAL_SKILLS_DIR="${GLOBAL_SKILLS_DIR:-${HOME}/.gemini/skills}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${GLOBAL_SKILLS_DIR}.disabled-${TS}"

if [[ ! -d "${LOCAL_SKILLS_DIR}" ]]; then
  echo "Local skills dir missing: ${LOCAL_SKILLS_DIR}" >&2
  exit 1
fi

if [[ ! -d "${GLOBAL_SKILLS_DIR}" ]]; then
  echo "Global skills dir missing: ${GLOBAL_SKILLS_DIR}" >&2
  exit 0
fi

shopt -s nullglob
conflicts=()
for path in "${LOCAL_SKILLS_DIR}"/*; do
  skill_name="$(basename "${path}")"
  if [[ -e "${GLOBAL_SKILLS_DIR}/${skill_name}" ]]; then
    conflicts+=("${skill_name}")
  fi
done

if [[ "${#conflicts[@]}" -eq 0 ]]; then
  echo "No skill conflicts detected."
  exit 0
fi

mkdir -p "${BACKUP_DIR}"
for skill_name in "${conflicts[@]}"; do
  mv "${GLOBAL_SKILLS_DIR}/${skill_name}" "${BACKUP_DIR}/${skill_name}"
  echo "disabled_global_skill=${skill_name}"
done

echo "backup_dir=${BACKUP_DIR}"
