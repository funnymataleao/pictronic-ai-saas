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
SIMULATE_500_FILE = PROJECT_ROOT / "tmp/SIMULATE_500"

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

def get_process_status(name):
    result = run_cmd(["npx", "pm2", "show", name])
    if "online" in result.stdout:
        return "online"
    if "stopped" in result.stdout:
        return "stopped"
    return "unknown"

def drill_next_down():
    print("\n--- DRILL 1: Next.js Runtime Down ---")
    run_cmd(["npx", "pm2", "stop", "pictronic-runtime"])
    print("Waiting 15s for watchdog to detect and recover...")
    time.sleep(15)
    status = get_process_status("pictronic-runtime")
    if status == "online":
        print("SUCCESS: Runtime is back online")
        return True
    else:
        print(f"FAILED: Runtime is {status}")
        return False

def drill_401():
    print("\n--- DRILL 2: 401 Unauthorized ---")
    if not ENV_FILE.exists():
        print(f"Error: {ENV_FILE} not found")
        return False
        
    # Corrupt token
    content = ENV_FILE.read_text()
    original_token = None
    new_content = []
    for line in content.splitlines():
        if line.startswith("CONNECTION_TOKEN="):
            original_token = line.split("=", 1)[1]
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
        return True
    else:
        print("FAILED: Token is still invalid")
        return False

def drill_500():
    print("\n--- DRILL 3: Transient 500 Error ---")
    SIMULATE_500_FILE.touch()
    print("Simulated 500 error enabled.")
    
    print("Waiting 15s for watchdog to detect signal...")
    time.sleep(15)
    
    # After detection, watchdog should restart runtime.
    # We should remove the 500 trigger so the next check succeeds.
    if SIMULATE_500_FILE.exists():
        SIMULATE_500_FILE.unlink()
    
    print("Simulated 500 error disabled. Waiting 15s for recovery...")
    time.sleep(15)
    
    status = get_process_status("pictronic-runtime")
    if status == "online":
        print("SUCCESS: Runtime is healthy after 500")
        return True
    else:
        print(f"FAILED: Runtime is {status}")
        return False

def main():
    print("Starting full drills...")
    results = {}
    results["next_down"] = drill_next_down()
    results["unauthorized_401"] = drill_401()
    results["transient_500"] = drill_500()
    
    print("\n--- FINAL SUMMARY ---")
    for drill, success in results.items():
        print(f"{drill}: {'PASS' if success else 'FAIL'}")
    
    summary_file = PROJECT_ROOT / "docs/e2e/jup58-drills-summary.json"
    summary_file.write_text(json.dumps(results, indent=2))
    print(f"\nSummary saved to {summary_file}")

if __name__ == "__main__":
    main()
