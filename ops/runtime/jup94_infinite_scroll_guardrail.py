#!/usr/bin/env python3
import argparse
import json
import os
import random
import socket
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DOCS_E2E = PROJECT_ROOT / "docs" / "e2e"


@dataclass
class HttpResult:
    status: int
    ok: bool
    url: str
    latency_ms: float
    json_body: Any | None = None
    text_body: str | None = None
    error: str | None = None
    content_type: str | None = None


def now_stamp() -> str:
    return time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())


def http_request(
    method: str,
    url: str,
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout_s: float = 8.0,
) -> HttpResult:
    req_headers = {
        "accept": "application/json",
        "content-type": "application/json",
    }
    if headers:
        req_headers.update(headers)

    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers=req_headers)

    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            ctype = (resp.headers.get("content-type") or "").strip().lower()
            parsed = None
            if "application/json" in ctype:
                try:
                    parsed = json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    parsed = None
            return HttpResult(
                status=int(getattr(resp, "status", 200)),
                ok=int(getattr(resp, "status", 200)) < 400,
                url=url,
                latency_ms=round((time.time() - started) * 1000, 2),
                json_body=parsed,
                text_body=raw[:2000],
                content_type=ctype,
            )
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        ctype = (exc.headers.get("content-type") or "").strip().lower()
        parsed = None
        if "application/json" in ctype:
            try:
                parsed = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                parsed = None
        return HttpResult(
            status=int(exc.code),
            ok=False,
            url=url,
            latency_ms=round((time.time() - started) * 1000, 2),
            json_body=parsed,
            text_body=raw[:2000],
            content_type=ctype,
        )
    except Exception as exc:
        return HttpResult(
            status=0,
            ok=False,
            url=url,
            latency_ms=round((time.time() - started) * 1000, 2),
            error=str(exc),
        )


def must_json_field(body: Any, *path: str) -> Any:
    cur = body
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            raise RuntimeError(f"Missing field: {'/'.join(path)}")
        cur = cur[key]
    return cur


def random_project_name() -> str:
    return f"jup94-infinite-{int(time.time())}-{random.randint(100, 999)}"


def create_session_headers(base_url: str) -> dict[str, str]:
    req = urllib.request.Request(f"{base_url}/api/auth/login", method="POST")
    try:
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            if int(getattr(resp, "status", 200)) != 200:
                raise RuntimeError(f"Auth login failed: HTTP {getattr(resp, 'status', 0)}")
            cookie_header = (resp.headers.get("set-cookie") or "").strip()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Auth login failed: HTTP {exc.code} body={body[:500]}") from exc
    except Exception as exc:
        raise RuntimeError(f"Auth login failed: {exc}") from exc

    cookie_pair = cookie_header.split(";", 1)[0].strip()
    if not cookie_pair:
        raise RuntimeError("Auth login did not return a session cookie")
    return {"Cookie": cookie_pair}


def ensure_bridge_node(base_url: str, bootstrap_key: str) -> dict[str, Any]:
    node_id = f"node-jup94-{int(time.time())}"
    machine_id = f"jup94-{socket.gethostname()}-{int(time.time())}"
    register = http_request(
        "POST",
        f"{base_url}/api/bridge/nodes/register",
        payload={
            "nodeId": node_id,
            "machineId": machine_id,
            "capabilities": ["generate", "upload", "metadata", "comfyui", "ollama"],
        },
        headers={"x-bridge-bootstrap-key": bootstrap_key},
        timeout_s=10,
    )
    if register.status != 201:
        raise RuntimeError(
            f"Bridge register failed: HTTP {register.status}, error={register.error}, body={register.text_body}"
        )
    token = must_json_field(register.json_body, "data", "connectionToken", "token")
    return {
        "nodeId": node_id,
        "machineId": machine_id,
        "register": register,
        "connectionToken": token,
    }


def create_project(base_url: str, auth_headers: dict[str, str] | None = None) -> tuple[str, HttpResult]:
    name = random_project_name()
    result = http_request("POST", f"{base_url}/api/projects", payload={"name": name}, headers=auth_headers)
    if result.status != 201:
        raise RuntimeError(f"Project create failed: HTTP {result.status} body={result.text_body} error={result.error}")
    project_id = must_json_field(result.json_body, "data", "id")
    return str(project_id), result


def generate_assets(
    base_url: str,
    project_id: str,
    batch: int,
    auth_headers: dict[str, str] | None = None,
) -> tuple[list[str], HttpResult]:
    idempotency_key = f"jup94-gen-{int(time.time())}-{random.randint(1000, 9999)}"
    headers = {"Idempotency-Key": idempotency_key}
    if auth_headers:
        headers.update(auth_headers)
    result = http_request(
        "POST",
        f"{base_url}/api/projects/{project_id}/generate",
        payload={
            "prompt": "pinterest noir editorial photography, high contrast",
            "provider": "local",
            "model": "flux-dev",
            "batch": batch,
        },
        headers=headers,
        timeout_s=15,
    )
    if result.status not in {200, 202}:
        raise RuntimeError(f"Generate failed: HTTP {result.status} body={result.text_body} error={result.error}")

    jobs = must_json_field(result.json_body, "data", "jobs")
    if not isinstance(jobs, list) or not jobs:
        raise RuntimeError("Generate response missing jobs list")

    asset_ids: list[str] = []
    for job in jobs:
        if isinstance(job, dict) and isinstance(job.get("assetId"), str):
            asset_ids.append(job["assetId"])
    if not asset_ids:
        raise RuntimeError("Generate response does not contain asset ids")

    return asset_ids, result


def fetch_assets_page(
    base_url: str,
    project_id: str,
    cursor: str | None,
    timeout_s: float = 8.0,
    auth_headers: dict[str, str] | None = None,
) -> HttpResult:
    url = f"{base_url}/api/projects/{project_id}/assets"
    if cursor:
        from urllib.parse import quote

        url = f"{url}?cursor={quote(cursor, safe='')}"
    return http_request("GET", url, timeout_s=timeout_s, headers=auth_headers)


def extract_items_and_cursor(page_body: Any) -> tuple[list[dict[str, Any]], str | None]:
    data = must_json_field(page_body, "data")
    items = data.get("items")
    cursor = data.get("nextCursor")
    if not isinstance(items, list):
        raise RuntimeError("assets page has invalid items")
    if cursor is not None and not isinstance(cursor, str):
        raise RuntimeError("assets page has invalid nextCursor")
    normalized: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            raise RuntimeError("assets page contains invalid item")
        normalized.append(item)
    return normalized, cursor


def collect_all_pages(
    base_url: str, project_id: str, auth_headers: dict[str, str] | None = None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    all_items: list[dict[str, Any]] = []
    page_logs: list[dict[str, Any]] = []
    cursor: str | None = None
    page_index = 0

    while True:
        page_index += 1
        res = fetch_assets_page(base_url, project_id, cursor, auth_headers=auth_headers)
        if res.status != 200:
            raise RuntimeError(f"assets page fetch failed at page={page_index}: HTTP {res.status}")

        items, next_cursor = extract_items_and_cursor(res.json_body)
        page_logs.append(
            {
                "page": page_index,
                "cursorIn": cursor,
                "cursorOut": next_cursor,
                "count": len(items),
                "latencyMs": res.latency_ms,
            }
        )
        all_items.extend(items)

        if not next_cursor:
            break
        cursor = next_cursor

    return all_items, page_logs


def collect_with_retry_simulation(
    base_url: str,
    project_id: str,
    backoff_ms: list[int],
    auth_headers: dict[str, str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    collected: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    cursor: str | None = None
    page = 0

    while True:
        page += 1
        success = False
        result: HttpResult | None = None

        for attempt in range(1, len(backoff_ms) + 2):
            injected_fault = page % 2 == 0 and attempt == 1
            if injected_fault:
                events.append(
                    {
                        "page": page,
                        "attempt": attempt,
                        "cursor": cursor,
                        "status": 0,
                        "fault": "simulated_timeout_before_request",
                        "backoffMs": backoff_ms[attempt - 1] if attempt - 1 < len(backoff_ms) else None,
                    }
                )
            else:
                result = fetch_assets_page(base_url, project_id, cursor, timeout_s=8.0, auth_headers=auth_headers)
                events.append(
                    {
                        "page": page,
                        "attempt": attempt,
                        "cursor": cursor,
                        "status": result.status,
                        "ok": result.ok,
                        "latencyMs": result.latency_ms,
                        "backoffMs": backoff_ms[attempt - 1] if attempt - 1 < len(backoff_ms) else None,
                        "error": result.error,
                    }
                )

                if result.status == 200:
                    success = True
                    break

            if attempt <= len(backoff_ms):
                time.sleep(backoff_ms[attempt - 1] / 1000.0)

        if not success or result is None:
            raise RuntimeError(f"retry sequence exhausted on page {page}")

        items, next_cursor = extract_items_and_cursor(result.json_body)
        collected.extend(items)

        if not next_cursor:
            break
        cursor = next_cursor

    return collected, events


def evaluate_runtime_split(
    base_url: str,
    control_plane_url: str,
    project_id: str,
    api_key: str,
    auth_headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    checks: dict[str, Any] = {}

    checks["ui_route_runtime"] = http_request("GET", f"{base_url}/projects/{project_id}", headers=auth_headers)
    checks["ui_route_control_plane"] = http_request("GET", f"{control_plane_url}/projects/{project_id}")

    checks["readiness_runtime"] = http_request("GET", f"{base_url}/api/runtime/readiness")
    checks["health_dashboard_runtime"] = http_request("GET", f"{base_url}/api/health?view=dashboard")

    checks["paperclip_agents_on_runtime"] = http_request(
        "GET",
        f"{base_url}/api/agents/me",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    checks["paperclip_agents_on_control"] = http_request(
        "GET",
        f"{control_plane_url}/api/agents/me",
        headers={"Authorization": f"Bearer {api_key}"},
    )

    checks["bridge_poll_bad_token"] = http_request(
        "POST",
        f"{base_url}/api/bridge/nodes/readiness-probe/poll",
        payload={"machineId": "jup94-readiness", "capabilities": ["generate"]},
        headers={"Authorization": "Bearer jup94_invalid"},
    )

    return checks


def main() -> int:
    parser = argparse.ArgumentParser(description="JUP-94 infinite scroll integration guardrails")
    parser.add_argument("--base-url", default=os.getenv("BACKEND_URL", "http://127.0.0.1:3000"))
    parser.add_argument("--control-plane-url", default=os.getenv("PAPERCLIP_API_URL", "http://127.0.0.1:3100"))
    parser.add_argument("--bootstrap-key", default=os.getenv("BRIDGE_BOOTSTRAP_KEY", "bridge-bootstrap-dev"))
    parser.add_argument("--paperclip-api-key", default=os.getenv("PAPERCLIP_API_KEY", ""))
    parser.add_argument("--batch", type=int, default=45)
    parser.add_argument("--max-pages", type=int, default=20)
    parser.add_argument("--backoff-ms", default="150,300,600")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    control_plane_url = args.control_plane_url.rstrip("/")
    backoff_ms = [int(x.strip()) for x in args.backoff_ms.split(",") if x.strip()]

    DOCS_E2E.mkdir(parents=True, exist_ok=True)
    stamp = now_stamp()
    prefix = DOCS_E2E / f"jup94-infinite-scroll-guardrail-{stamp}"
    summary_json_path = Path(f"{prefix}-summary.json")
    events_jsonl_path = Path(f"{prefix}-retry-events.jsonl")
    summary_md_path = Path(f"{prefix}.md")

    auth_headers = create_session_headers(base_url)
    bridge = ensure_bridge_node(base_url, args.bootstrap_key)
    project_id, _project_create = create_project(base_url, auth_headers=auth_headers)
    generated_asset_ids, _generate_result = generate_assets(
        base_url, project_id, batch=max(1, min(args.batch, 100)), auth_headers=auth_headers
    )

    canonical_items, canonical_pages = collect_all_pages(base_url, project_id, auth_headers=auth_headers)
    retry_items, retry_events = collect_with_retry_simulation(base_url, project_id, backoff_ms, auth_headers=auth_headers)

    if len(canonical_pages) > args.max_pages:
        raise RuntimeError(f"too many pages ({len(canonical_pages)}) exceeds max-pages={args.max_pages}")

    canonical_ids = [item["id"] for item in canonical_items]
    retry_ids = [item["id"] for item in retry_items]

    generated_set = set(generated_asset_ids)
    canonical_set = set(canonical_ids)
    retry_set = set(retry_ids)

    duplicates = len(canonical_ids) - len(canonical_set)
    missing_vs_generate = sorted(generated_set - canonical_set)
    extra_vs_generate = sorted(canonical_set - generated_set)

    page1_first = fetch_assets_page(base_url, project_id, None, auth_headers=auth_headers)
    page1_second = fetch_assets_page(base_url, project_id, None, auth_headers=auth_headers)
    page1_ids_first = [item["id"] for item in extract_items_and_cursor(page1_first.json_body)[0]] if page1_first.status == 200 else []
    page1_ids_second = [item["id"] for item in extract_items_and_cursor(page1_second.json_body)[0]] if page1_second.status == 200 else []

    runtime_split = evaluate_runtime_split(
        base_url, control_plane_url, project_id, args.paperclip_api_key, auth_headers=auth_headers
    )

    runtime_ui_ok = runtime_split["ui_route_runtime"].status == 200
    control_ui_body = (runtime_split["ui_route_control_plane"].text_body or "").lower()
    control_ui_isolation_ok = (
        runtime_split["ui_route_control_plane"].status != 200
        or ("paperclip" in control_ui_body and "pictronic workflow" not in control_ui_body)
    )
    control_api_ok = runtime_split["paperclip_agents_on_control"].status == 200
    runtime_api_isolation_ok = runtime_split["paperclip_agents_on_runtime"].status != 200
    readiness_ok = runtime_split["readiness_runtime"].status == 200
    health_ok = runtime_split["health_dashboard_runtime"].status == 200

    retry_fault_injected = sum(1 for e in retry_events if e.get("fault"))
    retry_http_attempts = sum(1 for e in retry_events if e.get("status") not in {None, 0})

    checks = {
        "cursorPaginationNoDuplicates": duplicates == 0,
        "cursorPaginationNoGaps": len(missing_vs_generate) == 0,
        "cursorPaginationNoUnexpected": len(extra_vs_generate) == 0,
        "cursorPaginationStableFirstPage": page1_ids_first == page1_ids_second,
        "retryBackoffDeterministicReplay": retry_set == canonical_set and retry_ids == canonical_ids,
        "runtimeUiOn3000": runtime_ui_ok,
        "runtimeUiNotOnControlPlane": control_ui_isolation_ok,
        "controlApiNotOnRuntime": runtime_api_isolation_ok,
        "controlApiOnControlPlane": control_api_ok,
        "readinessAndHealthReachable": readiness_ok and health_ok,
    }

    failed_checks = [name for name, ok in checks.items() if not ok]
    verdict = "pass" if not failed_checks else "fail"

    summary = {
        "issue": "JUP-94",
        "generatedAt": stamp,
        "command": " ".join(["python3", "ops/runtime/jup94_infinite_scroll_guardrail.py", *sys.argv[1:]]),
        "baseUrl": base_url,
        "controlPlaneUrl": control_plane_url,
        "projectId": project_id,
        "bridgeNodeId": bridge["nodeId"],
        "batch": args.batch,
        "counts": {
            "generatedJobs": len(generated_asset_ids),
            "canonicalItems": len(canonical_ids),
            "retryItems": len(retry_ids),
            "canonicalPages": len(canonical_pages),
            "duplicates": duplicates,
            "missingVsGenerate": len(missing_vs_generate),
            "extraVsGenerate": len(extra_vs_generate),
            "retryFaultInjected": retry_fault_injected,
            "retryHttpAttempts": retry_http_attempts,
        },
        "checks": checks,
        "failedChecks": failed_checks,
        "retryBackoffMs": backoff_ms,
        "diffs": {
            "missingAssetIdsVsGenerate": missing_vs_generate[:50],
            "unexpectedAssetIdsVsGenerate": extra_vs_generate[:50],
        },
        "pagination": {
            "canonicalPages": canonical_pages,
            "firstPageIdsRepeatMatch": page1_ids_first == page1_ids_second,
        },
        "runtimeSplit": {
            key: {
                "status": value.status,
                "ok": value.ok,
                "url": value.url,
                "latencyMs": value.latency_ms,
                "contentType": value.content_type,
                "error": value.error,
            }
            for key, value in runtime_split.items()
        },
        "artifacts": {
            "summaryJson": str(summary_json_path.relative_to(PROJECT_ROOT)),
            "retryEvents": str(events_jsonl_path.relative_to(PROJECT_ROOT)),
            "summaryMd": str(summary_md_path.relative_to(PROJECT_ROOT)),
        },
        "verdict": verdict,
    }

    summary_json_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    with events_jsonl_path.open("w", encoding="utf-8") as handle:
        for event in retry_events:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")

    md_lines: list[str] = []
    md_lines.append(f"# JUP-94 Infinite Scroll Reliability & Runtime Guardrails ({stamp})")
    md_lines.append("")
    md_lines.append("Issue: [JUP-94](/JUP/issues/JUP-94)")
    md_lines.append("Parent: [JUP-90](/JUP/issues/JUP-90)")
    md_lines.append("")
    md_lines.append("## Verdict")
    md_lines.append(verdict.upper())
    md_lines.append("")
    md_lines.append("## Checks")
    for name, ok in checks.items():
        md_lines.append(f"- {'PASS' if ok else 'FAIL'}: `{name}`")
    md_lines.append("")
    md_lines.append("## Key Results")
    md_lines.append(f"- Generated jobs: {len(generated_asset_ids)}")
    md_lines.append(f"- Paged items collected: {len(canonical_ids)} across {len(canonical_pages)} page(s)")
    md_lines.append(f"- Duplicates: {duplicates}; missing vs generated: {len(missing_vs_generate)}; unexpected: {len(extra_vs_generate)}")
    md_lines.append(f"- Retry simulation: injected faults={retry_fault_injected}, HTTP attempts={retry_http_attempts}, backoff={backoff_ms}")
    md_lines.append(f"- Runtime split: UI on :3000 status={runtime_split['ui_route_runtime'].status}; same UI on control-plane status={runtime_split['ui_route_control_plane'].status}")
    md_lines.append(f"- Control-plane API: :3100 /api/agents/me status={runtime_split['paperclip_agents_on_control'].status}; runtime :3000 status={runtime_split['paperclip_agents_on_runtime'].status}")
    md_lines.append("")
    md_lines.append("## Risks")
    md_lines.append("- Infinite-scroll sentry behavior is validated at API integration level (cursor + retry/backoff), not via browser IntersectionObserver automation in this run.")
    md_lines.append("- Runtime degradation branch was validated through readiness/health and bad-token poll probe while keeping UI route responsive; no destructive outage drill was executed in this pass.")
    md_lines.append("")
    md_lines.append("## Artifacts")
    md_lines.append(f"- `{summary_json_path.relative_to(PROJECT_ROOT)}`")
    md_lines.append(f"- `{events_jsonl_path.relative_to(PROJECT_ROOT)}`")
    md_lines.append(f"- `{summary_md_path.relative_to(PROJECT_ROOT)}`")

    summary_md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "ok": verdict == "pass",
                "verdict": verdict,
                "summary": str(summary_json_path),
                "markdown": str(summary_md_path),
                "events": str(events_jsonl_path),
            },
            ensure_ascii=False,
        )
    )

    return 0 if verdict == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
