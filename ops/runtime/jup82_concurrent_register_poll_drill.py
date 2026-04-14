#!/usr/bin/env python3
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DOCS_E2E = PROJECT_ROOT / "docs" / "e2e"
WATCHDOG_STATE = DOCS_E2E / "jup58-watchdog.state.json"
WATCHDOG_RECOVERY_LOG = DOCS_E2E / "jup58-watchdog-recovery.log"


def http_json(method: str, url: str, payload: dict | None, headers: dict | None = None) -> dict:
    req_headers = {"content-type": "application/json", "accept": "application/json"}
    if headers:
        req_headers.update(headers)

    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers=req_headers)

    started_at = time.time()
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(text) if text else {}
            return {
                "status": resp.status,
                "ok": resp.status < 400,
                "json": parsed,
                "latencyMs": round((time.time() - started_at) * 1000, 2),
            }
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        parsed = None
        try:
            parsed = json.loads(text) if text else None
        except json.JSONDecodeError:
            parsed = None
        return {
            "status": exc.code,
            "ok": False,
            "json": parsed,
            "body": text[:500],
            "latencyMs": round((time.time() - started_at) * 1000, 2),
        }
    except Exception as exc:  # network, timeout, etc.
        return {
            "status": 0,
            "ok": False,
            "error": str(exc),
            "latencyMs": round((time.time() - started_at) * 1000, 2),
        }


def run_readiness(base_url: str) -> dict:
    return http_json("GET", f"{base_url}/api/runtime/readiness", payload=None)


def register(base_url: str, bootstrap_key: str, node_id: str, machine_id: str) -> dict:
    return http_json(
        "POST",
        f"{base_url}/api/bridge/nodes/register",
        payload={
            "nodeId": node_id,
            "machineId": machine_id,
            "capabilities": ["generate", "upload", "comfyui", "ollama", "metadata"],
        },
        headers={"x-bridge-bootstrap-key": bootstrap_key},
    )


def poll(base_url: str, node_id: str, machine_id: str, token: str) -> dict:
    return http_json(
        "POST",
        f"{base_url}/api/bridge/nodes/{node_id}/poll",
        payload={
            "machineId": machine_id,
            "capabilities": ["generate", "upload", "comfyui", "ollama", "metadata"],
            "leaseTtlSeconds": 30,
        },
        headers={"authorization": f"Bearer {token}"},
    )


def load_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def extract_token(register_response: dict) -> str:
    payload = register_response.get("json") or {}
    return (((payload.get("data") or {}).get("connectionToken") or {}).get("token") or "").strip()


def extract_readiness_state(readiness_response: dict) -> str:
    payload = readiness_response.get("json") or {}
    return (((payload.get("data") or {}).get("overallStatus")) or "unknown").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="JUP-82 concurrent register/poll drill")
    parser.add_argument("--base-url", default=os.getenv("BACKEND_URL", "http://127.0.0.1:3000"))
    parser.add_argument("--bootstrap-key", default=os.getenv("BRIDGE_BOOTSTRAP_KEY", "bridge-bootstrap-dev"))
    parser.add_argument("--iterations", type=int, default=25)
    parser.add_argument("--polls-per-token", type=int, default=4)
    parser.add_argument("--max-workers", type=int, default=16)
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    DOCS_E2E.mkdir(parents=True, exist_ok=True)

    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    prefix = DOCS_E2E / f"jup82-concurrent-register-poll-{stamp}"
    events_path = Path(f"{prefix}-events.jsonl")
    summary_path = Path(f"{prefix}-summary.json")
    markdown_path = Path(f"{prefix}-summary.md")

    node_id = f"node-jup82-race-{int(time.time())}"
    machine_id = f"jup82-machine-{int(time.time())}"

    readiness_before = run_readiness(base_url)
    readiness_before_state = extract_readiness_state(readiness_before)

    events: list[dict] = []
    register_failures = 0

    for i in range(1, args.iterations + 1):
        reg_old = register(base_url, args.bootstrap_key, node_id=node_id, machine_id=machine_id)
        reg_new = register(base_url, args.bootstrap_key, node_id=node_id, machine_id=machine_id)

        old_token = extract_token(reg_old)
        new_token = extract_token(reg_new)
        if not old_token or not new_token:
            register_failures += 1
            events.append(
                {
                    "iteration": i,
                    "phase": "register",
                    "registerOld": reg_old,
                    "registerNew": reg_new,
                    "error": "missing token from register response",
                }
            )
            continue

        futures = []
        with ThreadPoolExecutor(max_workers=args.max_workers) as executor:
            for j in range(args.polls_per_token):
                futures.append(("prior", j + 1, executor.submit(poll, base_url, node_id, machine_id, old_token)))
                futures.append(("new", j + 1, executor.submit(poll, base_url, node_id, machine_id, new_token)))

            for token_kind, seq, fut in futures:
                poll_result = fut.result()
                poll_json = poll_result.get("json") or {}
                poll_ok = bool(poll_json.get("ok")) if isinstance(poll_json, dict) else False
                events.append(
                    {
                        "iteration": i,
                        "tokenKind": token_kind,
                        "request": seq,
                        "status": poll_result.get("status", 0),
                        "latencyMs": poll_result.get("latencyMs", 0),
                        "responseOk": poll_ok,
                        "error": poll_result.get("error"),
                        "body": poll_result.get("body"),
                    }
                )

    readiness_after = run_readiness(base_url)
    readiness_after_state = extract_readiness_state(readiness_after)

    watchdog_state = load_json(WATCHDOG_STATE)
    watchdog_recovery_tail = None
    if WATCHDOG_RECOVERY_LOG.exists():
        lines = WATCHDOG_RECOVERY_LOG.read_text(encoding="utf-8", errors="replace").splitlines()
        watchdog_recovery_tail = lines[-20:]

    new_events = [e for e in events if e.get("tokenKind") == "new"]
    prior_events = [e for e in events if e.get("tokenKind") == "prior"]

    def count_ok(items: list[dict]) -> int:
        return sum(1 for e in items if e.get("status") == 200 and e.get("responseOk") is True)

    def count_status(items: list[dict], status: int) -> int:
        return sum(1 for e in items if e.get("status") == status)

    new_failures = [e for e in new_events if not (e.get("status") == 200 and e.get("responseOk") is True)]

    verdict = "pass"
    failure_reasons = []
    if register_failures > 0:
        verdict = "fail"
        failure_reasons.append(f"register failures: {register_failures}")
    if new_failures:
        verdict = "fail"
        failure_reasons.append(f"new token poll failures: {len(new_failures)}")
    if readiness_before_state != "online":
        verdict = "fail"
        failure_reasons.append(f"readiness_before={readiness_before_state}")
    if readiness_after_state != "online":
        verdict = "fail"
        failure_reasons.append(f"readiness_after={readiness_after_state}")

    summary = {
        "issue": "JUP-82",
        "generatedAt": stamp,
        "baseUrl": base_url,
        "nodeId": node_id,
        "machineId": machine_id,
        "command": " ".join(["python3", "ops/runtime/jup82_concurrent_register_poll_drill.py", *sys.argv[1:]]),
        "iterations": args.iterations,
        "pollsPerToken": args.polls_per_token,
        "registerFailures": register_failures,
        "readiness": {
            "before": {"status": readiness_before.get("status"), "overallStatus": readiness_before_state},
            "after": {"status": readiness_after.get("status"), "overallStatus": readiness_after_state},
        },
        "counts": {
            "new": {
                "total": len(new_events),
                "ok200": count_ok(new_events),
                "status401": count_status(new_events, 401),
                "status500": count_status(new_events, 500),
            },
            "prior": {
                "total": len(prior_events),
                "ok200": count_ok(prior_events),
                "status401": count_status(prior_events, 401),
                "status500": count_status(prior_events, 500),
            },
        },
        "watchdog": {
            "stateFile": str(WATCHDOG_STATE),
            "exists": WATCHDOG_STATE.exists(),
            "snapshot": watchdog_state,
            "recoveryLog": str(WATCHDOG_RECOVERY_LOG),
            "recoveryTail": watchdog_recovery_tail,
        },
        "newTokenFailures": new_failures[:20],
        "verdict": verdict,
        "failureReasons": failure_reasons,
        "artifacts": {
            "events": str(events_path.relative_to(PROJECT_ROOT)),
            "summaryJson": str(summary_path.relative_to(PROJECT_ROOT)),
            "summaryMd": str(markdown_path.relative_to(PROJECT_ROOT)),
        },
    }

    with events_path.open("w", encoding="utf-8") as f:
        for event in events:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")

    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    markdown = []
    markdown.append(f"# JUP-82 Concurrent Register/Poll Drill ({stamp})")
    markdown.append("")
    markdown.append("## Command")
    markdown.append(f"- `{' '.join(["python3", "ops/runtime/jup82_concurrent_register_poll_drill.py", *sys.argv[1:]])}`")
    markdown.append("")
    markdown.append("## Verdict")
    markdown.append(f"- `{verdict.upper()}`")
    if failure_reasons:
        markdown.append(f"- Reasons: {', '.join(failure_reasons)}")
    markdown.append("")
    markdown.append("## Readiness + Watchdog")
    markdown.append(f"- Readiness before: HTTP {readiness_before.get('status')} ({readiness_before_state})")
    markdown.append(f"- Readiness after: HTTP {readiness_after.get('status')} ({readiness_after_state})")
    marker = ((watchdog_state or {}).get("last_marker") or "n/a") if isinstance(watchdog_state, dict) else "n/a"
    markdown.append(f"- Watchdog last marker: `{marker}`")
    markdown.append("")
    markdown.append("## Poll Outcome Counts")
    markdown.append(f"- New token: total={len(new_events)}, HTTP200+ok={count_ok(new_events)}, HTTP401={count_status(new_events, 401)}, HTTP500={count_status(new_events, 500)}")
    markdown.append(f"- Prior token: total={len(prior_events)}, HTTP200+ok={count_ok(prior_events)}, HTTP401={count_status(prior_events, 401)}, HTTP500={count_status(prior_events, 500)}")
    markdown.append("")
    markdown.append("## Artifacts")
    markdown.append(f"- `docs/e2e/{events_path.name}`")
    markdown.append(f"- `docs/e2e/{summary_path.name}`")
    markdown.append(f"- `docs/e2e/{markdown_path.name}`")
    markdown.append("")
    markdown.append("## Notes")
    markdown.append("- All register requests are executed as bursts (`register` x2) per iteration for the same nodeId.")
    markdown.append("- Poll requests for prior/new tokens are executed concurrently to force race overlap.")

    markdown_path.write_text("\n".join(markdown) + "\n", encoding="utf-8")

    print(json.dumps({"ok": verdict == "pass", "verdict": verdict, "summary": str(summary_path), "events": str(events_path)}))
    return 0 if verdict == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
