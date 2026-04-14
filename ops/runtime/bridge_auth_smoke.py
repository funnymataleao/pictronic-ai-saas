#!/usr/bin/env python3
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


def request_json(method: str, url: str, payload: dict | None = None, headers: dict | None = None) -> dict:
    req_headers = {
        "content-type": "application/json",
        "accept": "application/json",
    }
    if headers:
        req_headers.update(headers)

    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=req_headers)

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            content_type = (resp.headers.get("content-type") or "").lower()
            if "application/json" not in content_type:
                raise RuntimeError(f"non-JSON response from {url}: content-type={content_type or 'n/a'}")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} for {method} {url}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error for {method} {url}: {exc.reason}") from exc


def main() -> int:
    env_path = Path(os.getenv("PICTRONIC_RUNTIME_ENV_FILE", str(DEFAULT_ENV_FILE)))
    load_dotenv(env_path)

    backend_url = os.getenv("BACKEND_URL", "http://127.0.0.1:3000").rstrip("/")
    bootstrap_key = os.getenv("BRIDGE_BOOTSTRAP_KEY", "bridge-bootstrap-dev")
    machine_id = os.getenv("MACHINE_ID", socket.gethostname())
    node_id = f"node-bridge-auth-smoke-{int(time.time())}"

    register_url = f"{backend_url}/api/bridge/nodes/register"
    poll_url = f"{backend_url}/api/bridge/nodes/{node_id}/poll"

    registered = request_json(
        "POST",
        register_url,
        payload={
            "nodeId": node_id,
            "machineId": machine_id,
            "capabilities": ["generate", "upload", "comfyui", "ollama", "metadata"],
        },
        headers={"x-bridge-bootstrap-key": bootstrap_key},
    )

    token = (((registered.get("data") or {}).get("connectionToken") or {}).get("token") or "").strip()
    if not token:
        raise RuntimeError("register succeeded but no connection token was returned")

    polled = request_json(
        "POST",
        poll_url,
        payload={
            "machineId": machine_id,
            "capabilities": ["generate", "upload", "comfyui", "ollama", "metadata"],
            "leaseTtlSeconds": 30,
        },
        headers={"authorization": f"Bearer {token}"},
    )

    print(
        json.dumps(
            {
                "ok": True,
                "backendUrl": backend_url,
                "nodeId": node_id,
                "registerTokenPresent": True,
                "pollTokenId": (((polled.get("data") or {}).get("token") or {}).get("tokenId") or None),
                "pollResult": "success",
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
