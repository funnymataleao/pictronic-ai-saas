#!/usr/bin/env python3
"""
Local Bridge Connector for Pictronic.

Minimal run instructions:
1) Create a .env file (or export env vars):
   BACKEND_URL=http://127.0.0.1:3000
   NODE_ID=node-local-01
   MACHINE_ID=machine-local-01
   CONNECTION_TOKEN=<token from /api/bridge/nodes/register>
   COMFYUI_URL=http://127.0.0.1:8188
   POLL_INTERVAL_SECONDS=3
2) Run:
   python3 bridge_connector.py

Optional bootstrap (no pre-issued token):
- Set BRIDGE_BOOTSTRAP_KEY (default: bridge-bootstrap-dev)
- Run:
  python3 bridge_connector.py --register
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_dotenv(path: str = ".env") -> None:
    env_file = Path(path)
    if not env_file.exists():
        return

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ[key] = value


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


class HttpError(RuntimeError):
    pass


@dataclass
class BridgeConfig:
    backend_url: str
    node_id: str
    machine_id: str
    connection_token: str | None
    comfyui_url: str
    poll_interval_seconds: int
    lease_ttl_seconds: int
    bootstrap_key: str

    @staticmethod
    def from_env() -> "BridgeConfig":
        backend_url = os.getenv("BACKEND_URL", "http://127.0.0.1:3000").rstrip("/")
        node_id = os.getenv("NODE_ID", socket.gethostname())
        machine_id = os.getenv("MACHINE_ID", socket.gethostname())
        connection_token = os.getenv("CONNECTION_TOKEN")
        comfyui_url = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
        poll_interval_seconds = int(os.getenv("POLL_INTERVAL_SECONDS", "3"))
        lease_ttl_seconds = int(os.getenv("LEASE_TTL_SECONDS", "30"))
        bootstrap_key = os.getenv("BRIDGE_BOOTSTRAP_KEY", "bridge-bootstrap-dev")

        return BridgeConfig(
            backend_url=backend_url,
            node_id=node_id,
            machine_id=machine_id,
            connection_token=connection_token,
            comfyui_url=comfyui_url,
            poll_interval_seconds=poll_interval_seconds,
            lease_ttl_seconds=lease_ttl_seconds,
            bootstrap_key=bootstrap_key,
        )


class BridgeClient:
    def __init__(self, config: BridgeConfig, timeout: int = 20) -> None:
        self.config = config
        self.timeout = timeout

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        url = f"{self.config.backend_url}{path}"
        req_headers = {
            "content-type": "application/json",
            "accept": "application/json",
        }
        if headers:
            req_headers.update(headers)

        data: bytes | None = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(url, data=data, method=method, headers=req_headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
                content_type = (resp.headers.get("content-type") or "").lower()
                if "application/json" not in content_type:
                    snippet = raw.strip().replace("\n", " ")[:240]
                    raise HttpError(
                        f"{method} {path} -> non-JSON response content-type={content_type or 'n/a'} body='{snippet}'"
                    )
                try:
                    return json.loads(raw) if raw else {}
                except json.JSONDecodeError as exc:
                    snippet = raw.strip().replace("\n", " ")[:240]
                    raise HttpError(
                        f"{method} {path} -> invalid JSON response body='{snippet}'"
                    ) from exc
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            body_lower = body.lower()
            if "missing required error components, refreshing" in body_lower:
                raise HttpError(
                    f"{method} {path} -> HTTP {exc.code}: Next.js fallback HTML detected; restart backend with `npm run dev` (clean .next) and retry"
                ) from exc
            reason = str(exc.reason or "").strip()
            status = f"{exc.code} {reason}".strip()
            raise HttpError(f"{method} {path} -> HTTP {status}: {body}") from exc
        except urllib.error.URLError as exc:
            raise HttpError(f"{method} {path} -> network error: {exc.reason}") from exc

    def register_node(self) -> dict[str, Any]:
        body = {
            "nodeId": self.config.node_id,
            "machineId": self.config.machine_id,
            "capabilities": ["generate", "upload", "comfyui", "ollama", "metadata"],
        }
        return self._request(
            "POST",
            "/api/bridge/nodes/register",
            payload=body,
            headers={"x-bridge-bootstrap-key": self.config.bootstrap_key},
        )

    def poll(self) -> dict[str, Any]:
        if not self.config.connection_token:
            raise RuntimeError("CONNECTION_TOKEN is required for polling")

        body = {
            "machineId": self.config.machine_id,
            "capabilities": ["generate", "upload", "comfyui", "ollama", "metadata"],
            "leaseTtlSeconds": self.config.lease_ttl_seconds,
        }
        return self._request(
            "POST",
            f"/api/bridge/nodes/{self.config.node_id}/poll",
            payload=body,
            headers={"authorization": f"Bearer {self.config.connection_token}"},
        )

    def heartbeat(self) -> dict[str, Any]:
        if not self.config.connection_token:
            raise RuntimeError("CONNECTION_TOKEN is required for heartbeat")

        body = {
            "machineId": self.config.machine_id,
            "capabilities": ["generate", "upload", "comfyui", "ollama", "metadata"],
        }
        return self._request(
            "POST",
            f"/api/bridge/nodes/{self.config.node_id}/heartbeat",
            payload=body,
            headers={"authorization": f"Bearer {self.config.connection_token}"},
        )

    def submit_result(
        self,
        job_id: str,
        lease_id: str,
        outcome: str,
        result: dict[str, Any] | None = None,
        reason: str | None = None,
        retry_delay_ms: int | None = None,
    ) -> dict[str, Any]:
        if not self.config.connection_token:
            raise RuntimeError("CONNECTION_TOKEN is required for result submission")

        body: dict[str, Any] = {
            "nodeId": self.config.node_id,
            "leaseId": lease_id,
            "outcome": outcome,
        }
        if result is not None:
            body["result"] = result
        if reason:
            body["reason"] = reason
        if retry_delay_ms is not None:
            body["retryDelayMs"] = retry_delay_ms

        return self._request(
            "POST",
            f"/api/bridge/jobs/{job_id}/result",
            payload=body,
            headers={"authorization": f"Bearer {self.config.connection_token}"},
        )


class ComfyClient:
    def __init__(self, comfyui_url: str, timeout: int = 45) -> None:
        self.comfyui_url = comfyui_url
        self.timeout = timeout

    def execute(self, job_payload: dict[str, Any]) -> dict[str, Any]:
        prompt_payload: dict[str, Any]

        if isinstance(job_payload.get("promptPayload"), dict):
            prompt_payload = job_payload["promptPayload"]  # type: ignore[assignment]
        elif isinstance(job_payload.get("prompt"), dict):
            prompt_payload = job_payload["prompt"]  # type: ignore[assignment]
        else:
            prompt_payload = {
                "prompt": {
                    "text": str(job_payload.get("textPrompt") or job_payload.get("prompt") or "bridge-default-prompt")
                }
            }

        url = f"{self.comfyui_url}/prompt"
        req = urllib.request.Request(
            url,
            data=json.dumps(prompt_payload).encode("utf-8"),
            method="POST",
            headers={"content-type": "application/json"},
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
                parsed = json.loads(raw) if raw else {}
                return {
                    "comfyui": {
                        "endpoint": url,
                        "status": "ok",
                        "response": parsed,
                    }
                }
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"ComfyUI HTTP {exc.code}: {body}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"ComfyUI connection error: {exc.reason}") from exc


def process_single_cycle(client: BridgeClient, comfy: ComfyClient) -> bool:
    polled = client.poll()
    data = polled.get("data") or {}
    job = data.get("job")

    if not job:
        print(f"[{utc_now_iso()}] poll: no job available")
        return False

    job_id = str(job.get("jobId") or "")
    lease_id = str(job.get("leaseId") or "")
    job_kind = str(job.get("kind") or "unknown")
    payload = job.get("payload") if isinstance(job.get("payload"), dict) else {}

    if not job_id or not lease_id:
        raise RuntimeError("Polled job is missing jobId or leaseId")

    print(f"[{utc_now_iso()}] poll: leased job={job_id} kind={job_kind} lease={lease_id}")

    try:
        comfy_result = comfy.execute(payload)
        bridge_result = {
            "kind": job_kind,
            "executedAt": utc_now_iso(),
            "payloadEcho": payload,
            **comfy_result,
        }
        settled = client.submit_result(job_id=job_id, lease_id=lease_id, outcome="ack", result=bridge_result)
        settled_status = (((settled.get("data") or {}).get("job") or {}).get("status") or "unknown")
        print(f"[{utc_now_iso()}] submit: outcome=ack job={job_id} status={settled_status}")
        return True
    except Exception as exc:
        error_message = str(exc)
        failed_result = {
            "kind": job_kind,
            "executedAt": utc_now_iso(),
            "error": error_message,
        }
        settled = client.submit_result(
            job_id=job_id,
            lease_id=lease_id,
            outcome="fail",
            reason=error_message[:500],
            result=failed_result,
        )
        settled_status = (((settled.get("data") or {}).get("job") or {}).get("status") or "unknown")
        print(f"[{utc_now_iso()}] submit: outcome=fail job={job_id} status={settled_status} reason={error_message}")
        return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pictronic Local Bridge Connector")
    default_env_file = os.getenv("PICTRONIC_RUNTIME_ENV_FILE", ".env.runtime")
    parser.add_argument(
        "--env-file",
        default=default_env_file,
        help="Path to runtime env file (default: PICTRONIC_RUNTIME_ENV_FILE or .env.runtime)",
    )
    parser.add_argument("--register", action="store_true", help="Register node and print connection token")
    parser.add_argument(
        "--preflight",
        action="store_true",
        help="Validate NODE_ID/CONNECTION_TOKEN against backend via heartbeat and exit",
    )
    parser.add_argument("--once", action="store_true", help="Run exactly one poll cycle and exit")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_dotenv(args.env_file)

    config = BridgeConfig.from_env()
    client = BridgeClient(config)
    comfy = ComfyClient(config.comfyui_url)

    if args.register:
        registered = client.register_node()
        data = registered.get("data") or {}
        token = ((data.get("connectionToken") or {}).get("token") or "")
        node = data.get("node") or {}
        print(json_dumps({"registeredNode": node, "connectionToken": token}))
        registered_node_id = str(node.get("nodeId") or "")
        if registered_node_id and registered_node_id != config.node_id:
            print(
                f"NODE_ID mismatch: env NODE_ID={config.node_id} but backend registered nodeId={registered_node_id}.",
                file=sys.stderr,
            )
        if registered_node_id:
            print(f"Set NODE_ID={registered_node_id} to match the registered node id before polling.")
        if token:
            print("Set CONNECTION_TOKEN to the returned token before polling.")
        return 0

    if not config.connection_token:
        print("CONNECTION_TOKEN is missing. Use --register or set CONNECTION_TOKEN in env.", file=sys.stderr)
        return 1

    if args.preflight:
        try:
            heartbeat = client.heartbeat()
            data = heartbeat.get("data") or {}
            node = data.get("node") or {}
            token = data.get("token") or {}
            print(
                json_dumps(
                    {
                        "preflight": "ok",
                        "backendUrl": config.backend_url,
                        "nodeId": config.node_id,
                        "machineId": config.machine_id,
                        "nodeStatus": node.get("status"),
                        "tokenId": token.get("tokenId"),
                        "tokenExpiresAt": token.get("expiresAt"),
                    }
                )
            )
            return 0
        except Exception as exc:
            print(
                json_dumps(
                    {
                        "preflight": "failed",
                        "backendUrl": config.backend_url,
                        "nodeId": config.node_id,
                        "reason": str(exc),
                    }
                ),
                file=sys.stderr,
            )
            return 2

    if args.once:
        process_single_cycle(client, comfy)
        return 0

    print(
        f"[{utc_now_iso()}] connector started: backend={config.backend_url} node={config.node_id} pollInterval={config.poll_interval_seconds}s"
    )
    while True:
        try:
            process_single_cycle(client, comfy)
        except HttpError as exc:
            print(f"[{utc_now_iso()}] bridge error: {exc}", file=sys.stderr)
        except Exception as exc:  # pragma: no cover - defensive runtime path
            print(f"[{utc_now_iso()}] runtime error: {exc}", file=sys.stderr)

        time.sleep(max(config.poll_interval_seconds, 1))


if __name__ == "__main__":
    raise SystemExit(main())
