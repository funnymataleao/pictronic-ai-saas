#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"
TMP_DIR="$(mktemp -d)"
COOKIE_JAR="$TMP_DIR/cookies.txt"
ROOT_HTML="$TMP_DIR/root.html"
GUEST_PROJECTS="$TMP_DIR/guest_projects.json"
AUTH_PROJECTS="$TMP_DIR/auth_projects.json"
GUEST_ASSETS="$TMP_DIR/guest_assets.json"
AUTH_ASSETS="$TMP_DIR/auth_assets.json"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd jq
require_cmd rg

assert_contains() {
  local file="$1"
  local expected="$2"
  if ! rg -Fq "$expected" "$file"; then
    echo "Assertion failed: expected '$expected' in $file" >&2
    exit 1
  fi
}

assert_not_contains() {
  local file="$1"
  local unexpected="$2"
  if rg -Fq "$unexpected" "$file"; then
    echo "Assertion failed: did not expect '$unexpected' in $file" >&2
    exit 1
  fi
}

assert_status() {
  local actual="$1"
  local expected="$2"
  if [[ "$actual" != "$expected" ]]; then
    echo "Assertion failed: expected HTTP $expected, got $actual" >&2
    exit 1
  fi
}

echo "[jup103] guest root page should render public landing only"
root_status="$(curl -sS -o "$ROOT_HTML" -w '%{http_code}' "$BASE_URL/")"
assert_status "$root_status" "200"
assert_contains "$ROOT_HTML" "guest users can see this landing only"
assert_not_contains "$ROOT_HTML" "Pictronic Projects"

echo "[jup103] guest cannot read /api/projects"
guest_projects_status="$(curl -sS -o "$GUEST_PROJECTS" -w '%{http_code}' "$BASE_URL/api/projects")"
assert_status "$guest_projects_status" "401"
if [[ "$(jq -r '.error.code' "$GUEST_PROJECTS")" != "UNAUTHORIZED" ]]; then
  echo "Assertion failed: expected error.code=UNAUTHORIZED for guest /api/projects" >&2
  exit 1
fi

echo "[jup103] guest cannot read /api/projects/:id/assets"
guest_assets_status="$(curl -sS -o "$GUEST_ASSETS" -w '%{http_code}' "$BASE_URL/api/projects/project_demo/assets")"
assert_status "$guest_assets_status" "401"
if [[ "$(jq -r '.error.code' "$GUEST_ASSETS")" != "UNAUTHORIZED" ]]; then
  echo "Assertion failed: expected error.code=UNAUTHORIZED for guest assets feed" >&2
  exit 1
fi

echo "[jup103] login creates session cookie"
login_status="$(curl -sS -c "$COOKIE_JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/auth/login")"
assert_status "$login_status" "200"

echo "[jup103] authenticated session can read private feed endpoints"
auth_projects_status="$(curl -sS -b "$COOKIE_JAR" -o "$AUTH_PROJECTS" -w '%{http_code}' "$BASE_URL/api/projects")"
assert_status "$auth_projects_status" "200"
if [[ "$(jq -r '.ok' "$AUTH_PROJECTS")" != "true" ]]; then
  echo "Assertion failed: expected ok=true for authenticated /api/projects" >&2
  exit 1
fi

auth_assets_status="$(curl -sS -b "$COOKIE_JAR" -o "$AUTH_ASSETS" -w '%{http_code}' "$BASE_URL/api/projects/project_demo/assets")"
assert_status "$auth_assets_status" "200"
if [[ "$(jq -r '.ok' "$AUTH_ASSETS")" != "true" ]]; then
  echo "Assertion failed: expected ok=true for authenticated assets feed" >&2
  exit 1
fi

echo "[jup103] PASS: guest isolation and auth transition checks completed"
