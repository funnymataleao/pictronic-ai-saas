#!/usr/bin/env python3
import os
import subprocess
import time
import json
import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ENV_FILE = PROJECT_ROOT / ".env.runtime"
TIMESTAMP = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
PREFIX = f"jup39f-integration-readiness-rerun-{TIMESTAMP}"
SUMMARY_JSON = PROJECT_ROOT / f"docs/e2e/{PREFIX}-summary.json"
SUMMARY_MD = PROJECT_ROOT / f"docs/e2e/{PREFIX}-summary.md"

def run_cmd(cmd):
    print(f"Executing: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(PROJECT_ROOT))
    return result

def get_json(url, headers=None):
    cmd = ["curl", "-s"]
    if headers:
        for k, v in headers.items():
            cmd.extend(["-H", f"{k}: {v}"])
    cmd.append(url)
    res = run_cmd(cmd)
    try:
        return json.loads(res.stdout)
    except:
        return {"ok": False, "error": res.stdout or res.stderr}

def post_json(url, data, headers=None):
    cmd = ["curl", "-s", "-X", "POST", "-d", json.dumps(data)]
    if headers:
        for k, v in headers.items():
            cmd.extend(["-H", f"{k}: {v}"])
    cmd.append(url)
    res = run_cmd(cmd)
    try:
        return json.loads(res.stdout)
    except:
        return {"ok": False, "error": res.stdout or res.stderr}

def main():
    print(f"Starting readiness rerun: {PREFIX}")
    
    # 1. Readiness Check
    readiness = get_json("http://localhost:3000/api/runtime/readiness")
    overall_ok = readiness.get("ok", False)
    
    # 2. Bridge Preflight
    preflight_res = run_cmd(["python3", "bridge_connector.py", "--preflight"])
    bridge_preflight_ok = '"preflight":"ok"' in preflight_res.stdout
    
    # 3. Bridge Register (New Node)
    register_res = run_cmd(["python3", "bridge_connector.py", "--register"])
    bridge_token_obtained = '"connectionToken":' in register_res.stdout
    
    # 4. Bridge Flow (Enqueue + Poll)
    admin_headers = {"x-bridge-admin-key": "bridge-admin-dev", "Content-Type": "application/json"}
    job_payload = {"kind": "test_job", "payload": {"hello": "world"}}
    enqueue_res = post_json("http://localhost:3000/api/bridge/jobs", job_payload, admin_headers)
    job_id = enqueue_res.get("data", {}).get("job", {}).get("jobId")
    
    # 5. Adobe Path
    adobe_payload = {
        "ftpHost": "ftp.adobe.com",
        "ftpLogin": "test-login",
        "ftpPassword": "test-password"
    }
    adobe_res = post_json("http://localhost:3000/api/stock-connections/adobe/test", adobe_payload, {"Content-Type": "application/json"})
    
    # Build Summary
    summary = {
        "prefix": PREFIX,
        "verdict": "ok" if overall_ok and bridge_preflight_ok and bridge_token_obtained else "failed",
        "readiness": readiness,
        "bridge": {
            "preflight": "ok" if bridge_preflight_ok else "failed",
            "register": "ok" if bridge_token_obtained else "failed",
            "job_enqueued": job_id if job_id else "failed"
        },
        "adobe": adobe_res.get("data", {}).get("connectionStatus", "failed"),
        "timestamp": TIMESTAMP
    }
    
    with open(SUMMARY_JSON, "w") as f:
        json.dump(summary, f, indent=2)
        
    md_content = f"""# Integration Readiness Rerun Summary
Prefix: {PREFIX}
Status: {summary['verdict'].upper()}

## Readiness
- Overall: {'GREEN' if overall_ok else 'RED'}
- Contract Status: {readiness.get('data', {}).get('contract_v2', {}).get('status', 'unknown')}

## Bridge Flow
- Preflight: {summary['bridge']['preflight']}
- Register: {summary['bridge']['register']}
- Test Job Enqueued: {summary['bridge']['job_enqueued']}

## Adobe Path
- Connection Test: {summary['adobe']}

## Artifacts
- JSON: {SUMMARY_JSON.name}
"""
    with open(SUMMARY_MD, "w") as f:
        f.write(md_content)
        
    print(f"Done. Summary at {SUMMARY_MD}")

if __name__ == "__main__":
    main()
