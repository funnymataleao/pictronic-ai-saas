#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
import argparse
from pathlib import Path
from urllib.parse import urlparse

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_APP_API_ROOT = PROJECT_ROOT / "app" / "api"
DEFAULT_INSOMNIA_COLLECTION = PROJECT_ROOT / "docs" / "insomnia-collection.json"
HTTP_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD")


def normalize_route_path(route_file: Path) -> str:
    rel_parts = route_file.relative_to(PROJECT_ROOT / "app").parts[:-1]
    path = "/" + "/".join(rel_parts)
    path = re.sub(r"\[\.\.\.[^/\]]+\]", "{param}", path)
    path = re.sub(r"\[[^/\]]+\]", "{param}", path)
    return path


def normalize_request_path(raw_url: str) -> str | None:
    template_url = re.sub(r"\{\{[^}]+\}\}", "__var__", raw_url)
    parsed = urlparse(template_url)
    path = parsed.path or ""
    if not path.startswith("/api/"):
        match = re.search(r"(/api(?:/[^?\s]*)?)", template_url)
        path = match.group(1) if match else ""
    if not path.startswith("/api/"):
        return None
    normalized_parts: list[str] = []
    for part in path.split("/"):
        if not part:
            continue
        if part == "__var__":
            normalized_parts.append("{param}")
            continue
        if part.startswith("{") and part.endswith("}"):
            normalized_parts.append("{param}")
            continue
        normalized_parts.append(part)
    return "/" + "/".join(normalized_parts)


def route_method_pairs(app_api_root: Path) -> set[tuple[str, str]]:
    pairs: set[tuple[str, str]] = set()
    for route_file in sorted(app_api_root.glob("**/route.ts")):
        content = route_file.read_text(encoding="utf-8")
        methods = set(re.findall(r"export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b", content))
        normalized_path = normalize_route_path(route_file)
        for method in methods:
            pairs.add((method, normalized_path))
    return pairs


def collection_requests(collection_path: Path) -> list[dict]:
    data = json.loads(collection_path.read_text(encoding="utf-8"))
    resources = data.get("resources", [])
    requests: list[dict] = []
    for resource in resources:
        if resource.get("_type") != "request":
            continue
        method = str(resource.get("method", "GET")).upper()
        if method not in HTTP_METHODS:
            continue
        raw_url = str(resource.get("url", ""))
        normalized_path = normalize_request_path(raw_url)
        if not normalized_path:
            continue
        requests.append(
            {
                "id": resource.get("_id"),
                "name": resource.get("name", ""),
                "method": method,
                "path": normalized_path,
                "headers": resource.get("headers", []) or [],
            }
        )
    return requests


def has_nonempty_header(headers: list[dict], header_name: str) -> bool:
    target = header_name.lower()
    for header in headers:
        if not isinstance(header, dict):
            continue
        if bool(header.get("disabled")):
            continue
        name = str(header.get("name", "")).strip().lower()
        if name != target:
            continue
        value = str(header.get("value", "")).strip()
        if value:
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Insomnia collection coverage for app/api routes.")
    parser.add_argument(
        "--collection",
        type=Path,
        default=DEFAULT_INSOMNIA_COLLECTION,
        help="Path to Insomnia export JSON (default: docs/insomnia-collection.json)",
    )
    parser.add_argument(
        "--app-api-root",
        type=Path,
        default=DEFAULT_APP_API_ROOT,
        help="Path to app/api root directory (default: app/api)",
    )
    args = parser.parse_args()

    collection_path = args.collection if args.collection.is_absolute() else (PROJECT_ROOT / args.collection)
    app_api_root = args.app_api_root if args.app_api_root.is_absolute() else (PROJECT_ROOT / args.app_api_root)

    if not app_api_root.exists():
        print(f"[guardrail] missing directory: {app_api_root}")
        return 1
    if not collection_path.exists():
        print(f"[guardrail] missing collection: {collection_path}")
        return 1

    routes = route_method_pairs(app_api_root)
    requests = collection_requests(collection_path)
    request_pairs = {(req["method"], req["path"]) for req in requests}

    missing_pairs = sorted(routes - request_pairs)
    critical_post_paths = {
        "/api/projects/{param}/generate",
        "/api/uploads/adobe",
        "/api/assets/{param}/approve",
    }
    required_critical_posts = sorted((method, path) for method, path in routes if method == "POST" and path in critical_post_paths)

    critical_errors: list[str] = []
    for method, path in required_critical_posts:
        matching_requests = [req for req in requests if req["method"] == method and req["path"] == path]
        if not matching_requests:
            critical_errors.append(f"{method} {path} -> missing request in collection")
            continue
        for req in matching_requests:
            if not has_nonempty_header(req["headers"], "Idempotency-Key"):
                critical_errors.append(
                    f"{method} {path} -> request '{req['name']}' ({req['id']}) missing non-empty Idempotency-Key header"
                )

    print(f"[guardrail] app/api routes detected: {len(routes)}")
    print(f"[guardrail] insomnia runtime requests: {len(request_pairs)}")

    if missing_pairs:
        print("[guardrail] FAILED: missing app/api routes in docs/insomnia-collection.json")
        for method, path in missing_pairs:
            print(f"  - {method} {path}")
    if critical_errors:
        print("[guardrail] FAILED: idempotency guardrail violations")
        for error in critical_errors:
            print(f"  - {error}")

    if missing_pairs or critical_errors:
        return 1

    print("[guardrail] PASS: collection covers all app/api routes and critical POST idempotency headers.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
