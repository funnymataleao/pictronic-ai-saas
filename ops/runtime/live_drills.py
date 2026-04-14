#!/usr/bin/env python3
import os
import subprocess
import time
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ENV_FILE = PROJECT_ROOT / ".env.runtime"
RECOVERY_LOG = PROJECT_ROOT / "docs/e2e/jup58-watchdog-recovery.log"
STATE_FILE = PROJECT_ROOT / "docs/e2e/jup58-watchdog.state.json"

def run_cmd(cmd):
    # If first element is 'pm2', replace it with ['npx', '--yes', 'pm2']
    if cmd[0] == "pm2":
        cmd = ["npx", "--yes", "pm2"] + cmd[1:]
    elif cmd[0] == "npx" and cmd[1] == "pm2":
        cmd = ["npx", "--yes", "pm2"] + cmd[2:]
        
    print(f"Executing: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(PROJECT_ROOT))
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
    return result

def setup_pm2():
    print("Setting up PM2 stack...")
    run_cmd(["pm2", "delete", "all"])
    run_cmd(["pm2", "start", "ops/runtime/ecosystem.config.cjs"])
    time.sleep(15) # Wait for startup

def get_marker():
    cmd = ["python3", "ops/runtime/watchdog.py", "--once", "--env-file", str(ENV_FILE)]
    result = run_cmd(cmd)
    # Marker is in the log or we can deduce it
    return result.stdout

def drill_next_down():
    print("\n--- DRILL: Next.js Runtime Down ---")
    run_cmd(["npx", "pm2", "stop", "pictronic-runtime"])
    print("Waiting 15s for watchdog to detect and recover...")
    time.sleep(15)
    result = run_cmd(["npx", "pm2", "show", "pictronic-runtime"])
    if "online" in result.stdout:
        print("SUCCESS: Runtime is back online")
    else:
        print("FAILED: Runtime is still offline")

def drill_401():
    print("\n--- DRILL: 401 Unauthorized ---")
    # Corrupt token
    content = ENV_FILE.read_text()
    new_content = []
    for line in content.splitlines():
        if line.startswith("CONNECTION_TOKEN="):
            new_content.append("CONNECTION_TOKEN=invalid_token_for_drill")
        else:
            new_content.append(line)
    ENV_FILE.write_text("\n".join(new_content) + "\n")
    
    print("Waiting 15s for watchdog to detect and recover...")
    time.sleep(15)
    
    # Check if token changed
    updated_content = ENV_FILE.read_text()
    if "invalid_token_for_drill" not in updated_content:
        print("SUCCESS: Token was refreshed")
    else:
        print("FAILED: Token is still invalid")

def main():
    if not ENV_FILE.exists():
        print(f"Error: {ENV_FILE} not found")
        return
    
    setup_pm2()
    drill_next_down()
    drill_401()
    
    print("\nDrills completed. Check docs/e2e/ for logs.")

if __name__ == "__main__":
    main()
