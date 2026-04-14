#!/usr/bin/env python3
"""Runtime + bridge watchdog for 401/500 auto-recovery workflows."""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_REACHABLE_STATUSES = [400, 401, 403, 405, 422, 200, 201, 204]
SIGNATURE_401 = ("http 401 unauthorized", "http 401")
SIGNATURE_500 = ("http 500 internal server error", "http 500")


@dataclass
class WatchdogConfig:
    manager: str
    pm2_command: str
    runtime_service: str
    connector_service: str
    project_root: Path
    health_url: str
    readiness_url: str
    bridge_register_url: str
    bridge_jobs_url: str
    bridge_poll_probe_url: str
    runtime_error_log: Path
    connector_error_log: Path
    env_file: Path
    register_command: str
    poll_interval_seconds: float
    request_timeout_seconds: int
    readiness_timeout_seconds: int
    restart_cooldown_seconds: int
    startup_grace_seconds: int
    recovery_log: Path
    state_file: Path
    dry_run: bool


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def log_line(path: Path, message: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(f"[{utc_now_iso()}] {message}\n")


def run_cmd(cmd: list[str], dry_run: bool, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    if dry_run:
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        check=False,
    )


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {}


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, dir=str(path.parent)) as tmp:
        json.dump(state, tmp, ensure_ascii=True, indent=2)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)


def update_env_file(path: Path, updates: dict[str, str]) -> None:
    lines: list[str] = []
    seen: set[str] = set()
    source = path.read_text(encoding="utf-8").splitlines() if path.exists() else []

    for raw in source:
        line = raw.rstrip("\n")
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            lines.append(line)
            continue

        key, _ = line.split("=", 1)
        key = key.strip()
        if key in updates:
            safe = updates[key].replace("\n", " ").strip()
            lines.append(f"{key}={safe}")
            seen.add(key)
        else:
            lines.append(line)

    for key, value in updates.items():
        if key in seen:
            continue
        safe = value.replace("\n", " ").strip()
        lines.append(f"{key}={safe}")

    rendered = "\n".join(lines).rstrip("\n") + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, dir=str(path.parent)) as tmp:
        tmp.write(rendered)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)


def read_log_tail(path: Path, last_offset: int) -> tuple[int, str]:
    if not path.exists():
        return 0, ""

    file_size = path.stat().st_size
    offset = max(last_offset, 0)
    if file_size < offset:
        offset = 0

    with path.open("r", encoding="utf-8", errors="replace") as handle:
        handle.seek(offset)
        text = handle.read()
        new_offset = handle.tell()
    return new_offset, text


def detect_signature(text: str) -> str | None:
    lowered = text.lower()
    if any(sig in lowered for sig in SIGNATURE_401):
        return "401"
    if any(sig in lowered for sig in SIGNATURE_500):
        return "500"
    return None


def extract_json_payload(output: str) -> dict[str, Any] | None:
    for line in output.splitlines():
        candidate = line.strip()
        if not candidate.startswith("{") or not candidate.endswith("}"):
            continue
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def build_manager_cmd(config: WatchdogConfig, action: str, target: str) -> list[str]:
    if config.manager == "pm2":
        return [*shlex.split(config.pm2_command), action, target]
    return ["systemctl", action, target]


def control_process(config: WatchdogConfig, action: str, target: str) -> tuple[bool, str]:
    cmd = build_manager_cmd(config, action, target)
    result = run_cmd(cmd, config.dry_run, cwd=config.project_root)
    ok = result.returncode == 0
    message = result.stderr.strip() or result.stdout.strip() or "ok"
    return ok, message


def run_register_pipeline(config: WatchdogConfig) -> tuple[bool, str]:
    command = config.register_command.format(env_file=str(config.env_file))
    cmd = shlex.split(command)
    result = run_cmd(cmd, config.dry_run, cwd=config.project_root)

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "register command failed").strip()
        return False, f"register failed: {detail}"

    if config.dry_run:
        return True, "dry-run register succeeded"

    payload = extract_json_payload(result.stdout or "")
    if payload is None:
        return False, "register output missing JSON payload"

    token = str(payload.get("connectionToken") or "").strip()
    node = payload.get("registeredNode") if isinstance(payload.get("registeredNode"), dict) else {}
    node_id = str(node.get("nodeId") or "").strip()

    updates: dict[str, str] = {}
    if token:
        updates["CONNECTION_TOKEN"] = token
    if node_id:
        updates["NODE_ID"] = node_id

    if not updates:
        return False, "register response missing token and nodeId"

    update_env_file(config.env_file, updates)
    return True, "env token update succeeded"


def probe_json(
    *,
    url: str,
    method: str,
    timeout_seconds: int,
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    reachable_statuses: list[int] | None = None,
) -> tuple[bool, str]:
    request_headers = {"accept": "application/json"}
    if headers:
        request_headers.update(headers)

    raw_body = None
    if body is not None:
        raw_body = json.dumps(body).encode("utf-8")
        request_headers.setdefault("content-type", "application/json")

    req = urllib.request.Request(url, method=method.upper(), headers=request_headers, data=raw_body)
    allowed_statuses = reachable_statuses or DEFAULT_REACHABLE_STATUSES

    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            status = response.getcode()
            payload = response.read().decode("utf-8")
            content_type = (response.headers.get("content-type") or "").lower()
            if "application/json" not in content_type:
                return False, f"HTTP {status} non-json-content-type={content_type or 'none'}"
            parsed = json.loads(payload) if payload else {}
            if not isinstance(parsed, dict):
                return False, f"HTTP {status} invalid-json-shape"
            return status in allowed_statuses, f"HTTP {status}"
    except urllib.error.HTTPError as exc:
        content_type = (exc.headers.get("content-type") or "").lower()
        if "application/json" not in content_type:
            return False, f"HTTP {exc.code} non-json-content-type={content_type or 'none'}"
        return exc.code in allowed_statuses, f"HTTP {exc.code}"
    except (urllib.error.URLError, TimeoutError) as exc:
        return False, f"network-error={exc}"
    except json.JSONDecodeError as exc:
        return False, f"invalid-json={exc}"


def probe_ok_json(url: str, timeout_seconds: int) -> tuple[bool, str, dict[str, Any] | None]:
    req = urllib.request.Request(url, method="GET", headers={"accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            status = response.getcode()
            content_type = (response.headers.get("content-type") or "").lower()
            payload_raw = response.read().decode("utf-8")
            if status != 200:
                return False, f"HTTP {status}"
            if "application/json" not in content_type:
                return False, f"HTTP {status} non-json-content-type={content_type or 'none'}"
            payload = json.loads(payload_raw) if payload_raw else {}
            if not isinstance(payload, dict):
                return False, f"HTTP {status} invalid-json-shape", None
            if payload.get("ok") is not True:
                code = str(payload.get("error", {}).get("code") or "").strip()
                return False, f"ok=false{f' code={code}' if code else ''}", payload
            return True, "ok=true", payload
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}", None
    except (urllib.error.URLError, TimeoutError) as exc:
        return False, f"network-error={exc}", None
    except json.JSONDecodeError as exc:
        return False, f"invalid-json={exc}", None


def run_ping_suite(config: WatchdogConfig) -> tuple[bool, str]:
    checks: list[tuple[str, bool, str]] = []

    health_ok, health_detail = probe_json(
        url=config.health_url,
        method="GET",
        timeout_seconds=config.request_timeout_seconds,
        reachable_statuses=[200],
    )
    checks.append(("health", health_ok, health_detail))

    register_ok, register_detail = probe_json(
        url=config.bridge_register_url,
        method="POST",
        timeout_seconds=config.request_timeout_seconds,
        body={"machineId": "watchdog_probe"},
    )
    checks.append(("bridge_register", register_ok, register_detail))

    jobs_ok, jobs_detail = probe_json(
        url=config.bridge_jobs_url,
        method="GET",
        timeout_seconds=config.request_timeout_seconds,
    )
    checks.append(("bridge_jobs", jobs_ok, jobs_detail))

    poll_ok, poll_detail = probe_json(
        url=config.bridge_poll_probe_url,
        method="POST",
        timeout_seconds=config.request_timeout_seconds,
        headers={"authorization": "Bearer watchdog_probe_invalid"},
        body={},
    )
    checks.append(("bridge_poll", poll_ok, poll_detail))

    all_ok = all(item[1] for item in checks)
    marker = "|".join(f"{name}:{detail}" for name, _, detail in checks)
    return all_ok, marker


def wait_for_recovery_preconditions(config: WatchdogConfig) -> tuple[bool, str]:
    deadline = time.time() + config.readiness_timeout_seconds
    last_marker = "unknown"

    while time.time() < deadline:
        health_ok, health_marker, health_payload = probe_ok_json(config.health_url, config.request_timeout_seconds)
        readiness_ok, readiness_marker, readiness_payload = probe_ok_json(config.readiness_url, config.request_timeout_seconds)

        if health_ok:
            health_status = (
                str((health_payload or {}).get("data", {}).get("status") or "").strip().lower()
            )
            health_ok = health_status in {"ok", "degraded"}
            if not health_ok:
                health_marker = f"status={health_status or 'unknown'}"

        if readiness_ok:
            readiness_status = (
                str((readiness_payload or {}).get("data", {}).get("overallStatus") or "").strip().lower()
            )
            readiness_ok = readiness_status in {"online", "degraded"}
            if not readiness_ok:
                readiness_marker = f"overallStatus={readiness_status or 'unknown'}"

        marker = f"health:{health_marker}|readiness:{readiness_marker}"
        if health_ok and readiness_ok:
            return True, marker
        last_marker = marker
        time.sleep(1)

    return False, last_marker


def recover_full_stack(config: WatchdogConfig) -> tuple[bool, str]:
    runtime_ok, runtime_msg = control_process(config, "restart", config.runtime_service)
    if not runtime_ok:
        return False, f"runtime restart failed: {runtime_msg}"

    connector_ok, connector_msg = control_process(config, "restart", config.connector_service)
    if not connector_ok:
        return False, f"connector restart failed: {connector_msg}"

    if config.dry_run:
        return True, "dry-run full-stack restart succeeded"

    ready, reason = wait_for_recovery_preconditions(config)
    if not ready:
        return False, f"post-restart preconditions failing: {reason}"

    return True, f"post-restart healthy: {reason}"


def recover_connector_401(config: WatchdogConfig) -> tuple[bool, str]:
    stop_ok, stop_msg = control_process(config, "stop", config.connector_service)
    if not stop_ok:
        return False, f"connector stop failed: {stop_msg}"

    register_ok, register_msg = run_register_pipeline(config)
    if not register_ok:
        return False, register_msg

    restart_ok, restart_msg = control_process(config, "restart", config.connector_service)
    if not restart_ok:
        return False, f"connector restart failed: {restart_msg}"

    if config.dry_run:
        return True, "dry-run 401 recovery succeeded"

    ready, reason = wait_for_recovery_preconditions(config)
    if not ready:
        return False, f"post-401 preconditions failing: {reason}"

    return True, f"post-401 healthy: {reason}"


def detect_recovery_event(config: WatchdogConfig, state: dict[str, Any]) -> tuple[str | None, str, str]:
    log_offsets = state.get("log_offsets")
    if not isinstance(log_offsets, dict):
        log_offsets = {}

    runtime_offset = int(log_offsets.get("runtime_error_log", 0))
    connector_offset = int(log_offsets.get("connector_error_log", 0))

    runtime_new_offset, runtime_tail = read_log_tail(config.runtime_error_log, runtime_offset)
    connector_new_offset, connector_tail = read_log_tail(config.connector_error_log, connector_offset)

    log_offsets["runtime_error_log"] = runtime_new_offset
    log_offsets["connector_error_log"] = connector_new_offset
    state["log_offsets"] = log_offsets

    connector_sig = detect_signature(connector_tail)
    if connector_sig == "401":
        return "401", "connector_error_log", "signature=401"
    if connector_sig == "500":
        return "500", "connector_error_log", "signature=500"

    runtime_sig = detect_signature(runtime_tail)
    if runtime_sig == "500":
        return "500", "runtime_error_log", "signature=500"

    probes_ok, marker = run_ping_suite(config)
    if not probes_ok:
        return "500", "probe_failure", marker

    return None, "none", marker


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pictronic runtime/bridge watchdog")
    parser.add_argument("--manager", choices=["pm2", "systemd"], default="pm2")
    parser.add_argument("--pm2-command", default="pm2")
    parser.add_argument("--runtime-service", default="pictronic-runtime")
    parser.add_argument("--connector-service", default="bridge-connector")
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--health-url", default="http://127.0.0.1:3000/api/health")
    parser.add_argument("--readiness-url", default="http://127.0.0.1:3000/api/runtime/readiness")
    parser.add_argument("--bridge-register-url", default="http://127.0.0.1:3000/api/bridge/nodes/register")
    parser.add_argument("--bridge-jobs-url", default="http://127.0.0.1:3000/api/bridge/jobs")
    parser.add_argument("--bridge-poll-probe-url", default="http://127.0.0.1:3000/api/bridge/nodes/readiness-probe/poll")
    parser.add_argument("--runtime-error-log", default="docs/e2e/jup49-runtime.pm2.err.log")
    parser.add_argument("--connector-error-log", default="docs/e2e/jup49-connector.pm2.err.log")
    parser.add_argument("--env-file", default=os.getenv("PICTRONIC_RUNTIME_ENV_FILE", ".env.runtime"))
    parser.add_argument(
        "--register-command",
        default="python3 bridge_connector.py --register --env-file {env_file}",
        help="Connector register command template ({env_file} placeholder supported)",
    )
    parser.add_argument("--poll-interval-seconds", type=float, default=10.0)
    parser.add_argument("--request-timeout-seconds", type=int, default=5)
    parser.add_argument("--readiness-timeout-seconds", type=int, default=30)
    parser.add_argument("--restart-cooldown-seconds", type=int, default=10)
    parser.add_argument("--startup-grace-seconds", type=int, default=45)
    parser.add_argument("--recovery-log", default="docs/e2e/jup49-watchdog-recovery.log")
    parser.add_argument("--state-file", default="docs/e2e/jup49-watchdog.state.json")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def build_config(args: argparse.Namespace) -> WatchdogConfig:
    root = Path(args.project_root).resolve()

    def resolve(path: str) -> Path:
        candidate = Path(path)
        if candidate.is_absolute():
            return candidate
        return (root / candidate).resolve()

    return WatchdogConfig(
        manager=args.manager,
        pm2_command=args.pm2_command,
        runtime_service=args.runtime_service,
        connector_service=args.connector_service,
        project_root=root,
        health_url=args.health_url,
        readiness_url=args.readiness_url,
        bridge_register_url=args.bridge_register_url,
        bridge_jobs_url=args.bridge_jobs_url,
        bridge_poll_probe_url=args.bridge_poll_probe_url,
        runtime_error_log=resolve(args.runtime_error_log),
        connector_error_log=resolve(args.connector_error_log),
        env_file=resolve(args.env_file),
        register_command=args.register_command,
        poll_interval_seconds=max(args.poll_interval_seconds, 1.0),
        request_timeout_seconds=max(args.request_timeout_seconds, 1),
        readiness_timeout_seconds=max(args.readiness_timeout_seconds, 5),
        restart_cooldown_seconds=max(args.restart_cooldown_seconds, 1),
        startup_grace_seconds=max(args.startup_grace_seconds, 0),
        recovery_log=resolve(args.recovery_log),
        state_file=resolve(args.state_file),
        dry_run=args.dry_run,
    )


def execute_cycle(config: WatchdogConfig) -> int:
    state = load_state(config.state_file)
    now = int(time.time())
    grace_until_epoch = int(state.get("grace_until_epoch", 0))
    if grace_until_epoch <= 0:
        grace_until_epoch = now + config.startup_grace_seconds
        state["grace_until_epoch"] = grace_until_epoch
        state["last_grace_reason"] = "startup"
        log_line(
            config.recovery_log,
            f"startup grace active for {config.startup_grace_seconds}s (until epoch={grace_until_epoch})",
        )

    trigger, source, marker = detect_recovery_event(config, state)

    if trigger is None:
        if state.get("last_status") != "healthy":
            log_line(config.recovery_log, f"healthy marker={marker}")
        state["last_status"] = "healthy"
        state["last_marker"] = marker
        state["last_healthy_at"] = utc_now_iso()
        save_state(config.state_file, state)
        return 0

    if trigger == "500" and now < grace_until_epoch:
        state["last_status"] = "grace"
        state["last_marker"] = marker
        state["last_grace_reason"] = f"suppressed_500_{source}"
        state["last_grace_remaining_seconds"] = max(grace_until_epoch - now, 0)
        state["last_grace_event_at"] = utc_now_iso()
        save_state(config.state_file, state)
        return 0

    event_key = f"{trigger}:{source}:{marker}"
    last_recovery_epoch = int(state.get("last_recovery_epoch", 0))
    within_cooldown = (now - last_recovery_epoch) < config.restart_cooldown_seconds
    if within_cooldown and state.get("last_event_key") == event_key:
        save_state(config.state_file, state)
        return 0

    log_line(config.recovery_log, f"signal detected: {trigger} source={source} marker={marker}")
    started = time.time()
    if trigger == "401":
        ok, reason = recover_connector_401(config)
    else:
        ok, reason = recover_full_stack(config)
    duration = round(time.time() - started, 3)
    result = "success" if ok else "failed"
    log_line(config.recovery_log, f"recovery result={result} signal={trigger} duration_seconds={duration} reason={reason}")

    state["last_status"] = "healthy" if ok else "failed"
    state["last_event_key"] = event_key
    state["last_recovery_epoch"] = now
    state["last_recovery_duration_seconds"] = duration
    if ok:
        state["last_success_at"] = utc_now_iso()
        if trigger == "500":
            state["grace_until_epoch"] = now + config.startup_grace_seconds
            state["last_grace_reason"] = "post_runtime_restart"
    else:
        state["last_failure_at"] = utc_now_iso()
        state["last_failure_reason"] = reason
    save_state(config.state_file, state)

    return 0 if ok else 2


def main() -> int:
    args = parse_args()
    config = build_config(args)

    if args.once:
        return execute_cycle(config)

    log_line(config.recovery_log, "watchdog started")
    while True:
        code = execute_cycle(config)
        if code not in (0, 2):
            return code
        time.sleep(config.poll_interval_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
