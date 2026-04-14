#!/usr/bin/env python3
import json
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DOCS_E2E = PROJECT_ROOT / "docs" / "e2e"
BASE_URL = "http://127.0.0.1:3000"


def run_cmd(command: list[str], log_path: Path) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(f"$ {' '.join(command)}\n")
        handle.write(f"exit={result.returncode}\n")
        if result.stdout:
            handle.write(result.stdout.rstrip() + "\n")
        if result.stderr:
            handle.write(result.stderr.rstrip() + "\n")
        handle.write("\n")
    return result


def http_json(url: str) -> dict:
    request = urllib.request.Request(url, method="GET", headers={"accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read().decode("utf-8")
            return {
                "ok": True,
                "status": response.getcode(),
                "url": url,
                "data": json.loads(body) if body else {},
            }
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        return {"ok": False, "status": exc.code, "url": url, "error": payload[:500]}
    except Exception as exc:
        return {"ok": False, "status": 0, "url": url, "error": str(exc)}


def wait_for_online(names: list[str], timeout_seconds: int, log_path: Path) -> tuple[bool, dict[str, str]]:
    deadline = time.time() + timeout_seconds
    last_states: dict[str, str] = {}

    while time.time() < deadline:
        result = run_cmd(["npx", "--yes", "pm2", "jlist"], log_path)
        if result.returncode == 0:
            try:
                items = json.loads(result.stdout or "[]")
            except json.JSONDecodeError:
                items = []

            table = {}
            for item in items:
                name = item.get("name")
                status = ((item.get("pm2_env") or {}).get("status")) or "unknown"
                table[name] = status

            last_states = {name: table.get(name, "missing") for name in names}
            if all(state == "online" for state in last_states.values()):
                return True, last_states

        time.sleep(3)

    return False, last_states


def wait_for_http_200(url: str, timeout_seconds: int) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        probe = http_json(url)
        if probe.get("status") == 200:
            return True
        time.sleep(2)
    return False


def main() -> int:
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    DOCS_E2E.mkdir(parents=True, exist_ok=True)

    command_log = DOCS_E2E / f"jup106-closeout-{stamp}-commands.log"
    summary_path = DOCS_E2E / f"jup106-closeout-{stamp}-summary.json"
    report_path = DOCS_E2E / f"jup106-closeout-{stamp}.md"
    health_before_path = DOCS_E2E / f"jup106-closeout-{stamp}-health-before.json"
    readiness_before_path = DOCS_E2E / f"jup106-closeout-{stamp}-readiness-before.json"
    health_after_path = DOCS_E2E / f"jup106-closeout-{stamp}-health-after.json"
    readiness_after_path = DOCS_E2E / f"jup106-closeout-{stamp}-readiness-after.json"
    bridge_auth_before_path = DOCS_E2E / f"jup106-closeout-{stamp}-bridge-auth-before.txt"
    bridge_auth_after_path = DOCS_E2E / f"jup106-closeout-{stamp}-bridge-auth-after.txt"
    jup82_stdout_path = DOCS_E2E / f"jup106-closeout-{stamp}-jup82.stdout.json"

    run_cmd(["npx", "--yes", "pm2", "start", "ops/runtime/ecosystem.config.cjs", "--update-env"], command_log)
    startup_ready, startup_states = wait_for_online(["pictronic-runtime", "bridge-connector"], 60, command_log)
    startup_http_ready = wait_for_http_200(f"{BASE_URL}/api/runtime/readiness", 60)

    health_before = http_json(f"{BASE_URL}/api/health?view=ops")
    readiness_before = http_json(f"{BASE_URL}/api/runtime/readiness")
    health_before_path.write_text(json.dumps(health_before, indent=2) + "\n", encoding="utf-8")
    readiness_before_path.write_text(json.dumps(readiness_before, indent=2) + "\n", encoding="utf-8")

    auth_before = run_cmd(["bash", "ops/runtime/verify-bridge-auth.sh"], command_log)
    bridge_auth_before_path.write_text((auth_before.stdout or "") + (auth_before.stderr or ""), encoding="utf-8")

    run_cmd(["npx", "--yes", "pm2", "stop", "pictronic-runtime", "bridge-connector"], command_log)
    recovered, process_states = wait_for_online(["pictronic-runtime", "bridge-connector"], 60, command_log)
    recovered_http_ready = wait_for_http_200(f"{BASE_URL}/api/runtime/readiness", 60)

    auth_after = run_cmd(["bash", "ops/runtime/verify-bridge-auth.sh"], command_log)
    bridge_auth_after_path.write_text((auth_after.stdout or "") + (auth_after.stderr or ""), encoding="utf-8")

    jup82 = run_cmd(["python3", "ops/runtime/jup82_concurrent_register_poll_drill.py"], command_log)
    jup82_stdout_path.write_text((jup82.stdout or "") + "\n", encoding="utf-8")

    health_after = http_json(f"{BASE_URL}/api/health?view=ops")
    readiness_after = http_json(f"{BASE_URL}/api/runtime/readiness")
    health_after_path.write_text(json.dumps(health_after, indent=2) + "\n", encoding="utf-8")
    readiness_after_path.write_text(json.dumps(readiness_after, indent=2) + "\n", encoding="utf-8")

    summary = {
        "ok": bool(
            startup_ready
            and startup_http_ready
            and recovered
            and recovered_http_ready
            and auth_before.returncode == 0
            and auth_after.returncode == 0
            and jup82.returncode == 0
            and health_after.get("status") == 200
            and readiness_after.get("status") == 200
        ),
        "generatedAt": stamp,
        "checks": {
            "startupOnlineBeforeDrill": startup_ready,
            "startupHttpReadyBeforeDrill": startup_http_ready,
            "runtimeBridgeRecoveredAfterStop": recovered,
            "runtimeHttpReadyAfterRecovery": recovered_http_ready,
            "bridgeAuthBefore": auth_before.returncode == 0,
            "bridgeAuthAfter": auth_after.returncode == 0,
            "registerPollRaceDrill": jup82.returncode == 0,
            "healthAfter200": health_after.get("status") == 200,
            "readinessAfter200": readiness_after.get("status") == 200,
        },
        "processStatesAtStartup": startup_states,
        "processStatesAfterRecovery": process_states,
        "artifacts": {
            "commandLog": str(command_log.relative_to(PROJECT_ROOT)),
            "healthBefore": str(health_before_path.relative_to(PROJECT_ROOT)),
            "readinessBefore": str(readiness_before_path.relative_to(PROJECT_ROOT)),
            "healthAfter": str(health_after_path.relative_to(PROJECT_ROOT)),
            "readinessAfter": str(readiness_after_path.relative_to(PROJECT_ROOT)),
            "bridgeAuthBefore": str(bridge_auth_before_path.relative_to(PROJECT_ROOT)),
            "bridgeAuthAfter": str(bridge_auth_after_path.relative_to(PROJECT_ROOT)),
            "jup82Stdout": str(jup82_stdout_path.relative_to(PROJECT_ROOT)),
            "summary": str(summary_path.relative_to(PROJECT_ROOT)),
            "report": str(report_path.relative_to(PROJECT_ROOT)),
        },
        "rootCauseToFixTrace": [
            "Root cause: previous blocker state centered on unstable runtime health semantics and recovery proof gap.",
            "Fix: unified PM2 runtime/connector/watchdog supervision with strict health/readiness gates in watchdog.",
            "Fix: bridge auth token lifecycle hardened for repeated register->poll with bounded token history and race drill coverage.",
            "Validation: stop runtime+connector and observe autonomous recovery to online plus successful auth/race checks.",
        ],
    }
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    md = [
        f"# JUP-106 Closeout Drill ({stamp})",
        "",
        f"- Verdict: `{'PASS' if summary['ok'] else 'FAIL'}`",
        f"- Runtime/bridge recovered after stop: `{recovered}`",
        f"- Bridge auth before/after: `{auth_before.returncode == 0}` / `{auth_after.returncode == 0}`",
        f"- Register->poll race drill (`jup82`) pass: `{jup82.returncode == 0}`",
        "",
        "## Root Cause -> Fix Trace",
        "- Root cause: recovery closeout blocked by runtime health-state instability and missing deterministic proof bundle.",
        "- Fix: maintain unified runtime/bridge/watchdog supervisor topology with watchdog preconditions and automated recovery.",
        "- Fix: enforce repeat-register auth robustness with bridge auth smoke and concurrent register/poll drill.",
        "",
        "## Artifacts",
        f"- `{summary['artifacts']['commandLog']}`",
        f"- `{summary['artifacts']['healthBefore']}`",
        f"- `{summary['artifacts']['readinessBefore']}`",
        f"- `{summary['artifacts']['healthAfter']}`",
        f"- `{summary['artifacts']['readinessAfter']}`",
        f"- `{summary['artifacts']['bridgeAuthBefore']}`",
        f"- `{summary['artifacts']['bridgeAuthAfter']}`",
        f"- `{summary['artifacts']['jup82Stdout']}`",
        f"- `{summary['artifacts']['summary']}`",
    ]
    report_path.write_text("\n".join(md) + "\n", encoding="utf-8")

    print(json.dumps({"ok": summary["ok"], "summary": str(summary_path), "report": str(report_path)}))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
