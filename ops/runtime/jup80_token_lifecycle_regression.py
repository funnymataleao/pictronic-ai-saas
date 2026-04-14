#!/usr/bin/env python3
import hashlib
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_ENV_FILE = PROJECT_ROOT / ".env.runtime"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ[key] = value


def request_json(
    method: str,
    url: str,
    payload: dict | None = None,
    headers: dict | None = None,
    expected_statuses: set[int] | None = None,
) -> tuple[int, dict]:
    req_headers = {
        "content-type": "application/json",
        "accept": "application/json",
    }
    if headers:
        req_headers.update(headers)

    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=req_headers)
    expected = expected_statuses or {200}

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            status = int(getattr(resp, "status", 200))
            body = resp.read().decode("utf-8")
            parsed = json.loads(body) if body else {}
            if status not in expected:
                raise RuntimeError(f"Unexpected HTTP {status} for {method} {url}: {body}")
            return status, parsed
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        status = int(exc.code)
        parsed = {}
        if body:
            try:
                parsed = json.loads(body)
            except json.JSONDecodeError:
                parsed = {"raw": body}
        if status not in expected:
            raise RuntimeError(f"HTTP {status} for {method} {url}: {body}") from exc
        return status, parsed
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error for {method} {url}: {exc.reason}") from exc


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def poll_node(backend_url: str, node_id: str, token: str) -> tuple[int, dict]:
    return request_json(
        "POST",
        f"{backend_url}/api/bridge/nodes/{node_id}/poll",
        payload={"machineId": socket.gethostname(), "leaseTtlSeconds": 30},
        headers={"authorization": f"Bearer {token}"},
        expected_statuses={200, 401},
    )


def main() -> int:
    env_path = Path(os.getenv("PICTRONIC_RUNTIME_ENV_FILE", str(DEFAULT_ENV_FILE)))
    load_dotenv(env_path)

    backend_url = os.getenv("BACKEND_URL", "http://127.0.0.1:3000").rstrip("/")
    bootstrap_key = os.getenv("BRIDGE_BOOTSTRAP_KEY", "bridge-bootstrap-dev")
    admin_key = os.getenv("BRIDGE_ADMIN_KEY", "bridge-admin-dev")
    machine_id = os.getenv("MACHINE_ID", socket.gethostname())
    register_cycles = int(os.getenv("JUP80_REGISTER_CYCLES", "80"))
    node_id = f"node-jup80-{int(time.time())}"

    register_url = f"{backend_url}/api/bridge/nodes/register"
    issued_tokens: list[str] = []
    auth_state_file = ""

    for _ in range(register_cycles):
        _, registered = request_json(
            "POST",
            register_url,
            payload={
                "nodeId": node_id,
                "machineId": machine_id,
                "capabilities": ["generate", "metadata", "upload"],
            },
            headers={"x-bridge-bootstrap-key": bootstrap_key},
            expected_statuses={201},
        )
        token = (((registered.get("data") or {}).get("connectionToken") or {}).get("token") or "").strip()
        if not token:
            raise RuntimeError("register response missing connection token")
        issued_tokens.append(token)
        if not auth_state_file:
            auth_state_file = (((registered.get("data") or {}).get("auth") or {}).get("authStateFile") or "").strip()
        time.sleep(0.003)

    if not auth_state_file:
        raise RuntimeError("register response missing auth state path")

    state_path = Path(auth_state_file)
    if not state_path.exists():
        raise RuntimeError(f"auth state file not found at {state_path}")

    snapshot = json.loads(state_path.read_text(encoding="utf-8"))
    tokens = snapshot.get("tokens") or []
    active_hashes = {
        item.get("tokenHash")
        for item in tokens
        if item.get("nodeId") == node_id and not item.get("revokedAt")
    }
    issued_pairs = [(token_hash(token), token) for token in issued_tokens]
    retained_tokens = [token for digest, token in issued_pairs if digest in active_hashes]
    pruned_tokens = [token for digest, token in issued_pairs if digest not in active_hashes]

    active_token_count = len(retained_tokens)
    if active_token_count >= register_cycles:
        raise RuntimeError(
            f"token history did not prune after stress cycle (active={active_token_count}, cycles={register_cycles})"
        )
    if active_token_count > 50:
        raise RuntimeError(f"token history exceeds max bound 50 (active={active_token_count})")

    newest_token = issued_tokens[-1]
    newest_status, newest_poll = poll_node(backend_url, node_id, newest_token)
    if newest_status != 200:
        raise RuntimeError(f"latest token poll should succeed, got HTTP {newest_status}: {json.dumps(newest_poll)}")

    stale_retained_status = None
    stale_retained_error = None
    stale_retained_token = None
    for candidate in reversed(issued_tokens[:-1]):
        if token_hash(candidate) in active_hashes:
            stale_retained_token = candidate
            break

    if stale_retained_token:
        stale_retained_status, stale_retained_body = poll_node(backend_url, node_id, stale_retained_token)
        if stale_retained_status != 200:
            stale_retained_error = stale_retained_body

    pruned_status = None
    pruned_error = None
    if not pruned_tokens:
        raise RuntimeError("expected at least one pruned token after stress cycle")
    pruned_status, pruned_body = poll_node(backend_url, node_id, pruned_tokens[0])
    if pruned_status != 401:
        raise RuntimeError(f"pruned stale token should be rejected with 401, got HTTP {pruned_status}")
    pruned_error = ((pruned_body.get("error") or {}).get("message")) if isinstance(pruned_body, dict) else None

    _, metrics = request_json(
        "GET",
        f"{backend_url}/api/bridge/nodes/auth-metrics",
        headers={"x-bridge-admin-key": admin_key},
        expected_statuses={200},
    )
    counters = ((metrics.get("data") or {}).get("counters")) or {}

    result = {
        "ok": True,
        "backendUrl": backend_url,
        "nodeId": node_id,
        "registerCycles": register_cycles,
        "activeTokenCount": active_token_count,
        "latestTokenPollHttpStatus": newest_status,
        "retainedStaleTokenPollHttpStatus": stale_retained_status,
        "retainedStaleTokenPollError": stale_retained_error,
        "prunedStaleTokenPollHttpStatus": pruned_status,
        "prunedStaleTokenError": pruned_error,
        "authDecisionCounters": counters,
        "authStateFile": str(state_path),
    }

    if stale_retained_status is not None and stale_retained_status != 200:
        raise RuntimeError(
            "retained stale token was rejected unexpectedly: "
            f"HTTP {stale_retained_status} {json.dumps(stale_retained_error)}"
        )

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
