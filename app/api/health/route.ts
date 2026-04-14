import { jsonOk } from "@/lib/api/http";
import { getBridgeAuthDecisionCounters, getBridgeAuthDecisionHistory } from "@/lib/bridge/runtime";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

type RecoverySignal = "401" | "500";
type HealthStatus = "ok" | "degraded" | "failed";
type BridgeAuthErrorClass = "invalid" | "revoked" | "expired" | "token-node-mismatch" | "missing-node";

type WatchdogState = {
  last_marker?: string;
  last_success_at?: string;
  last_failure_at?: string;
  last_failure_reason?: string;
};

type LogMeta = {
  lastSignalAt: string | null;
  lastSignalCode: RecoverySignal | null;
  lastResultAt: string | null;
  lastResultCode: RecoverySignal | null;
  lastResult: "success" | "failed" | null;
  lastResultReason: string | null;
  lastRestartAt: string | null;
  lastTokenRefreshAt: string | null;
};

type HealthPayload = {
  status: HealthStatus;
  service: string;
  checkedAt: string;
  autonomyMode: {
    selfHealingActive: boolean;
    status: "active" | "inactive";
    reason: string;
    lastRestartAt: string | null;
    lastTokenRefreshAt: string | null;
    nextWatchdogCheckAt: string | null;
    pollIntervalSeconds: number;
    latestSignalCode: RecoverySignal | null;
    latestSignalAt: string | null;
    bridgeAuth: {
      lastErrorClass: BridgeAuthErrorClass | null;
      lastErrorAt: string | null;
      counters: {
        invalid: number;
        revoked: number;
        expired: number;
        tokenNodeMismatch: number;
        missingNode: number;
      };
      history: {
        at: string;
        errorClass: BridgeAuthErrorClass;
        nodeId: string | null;
        tokenId: string | null;
        reason: string;
      }[];
    };
  };
  recovery: {
    inProgress: boolean;
    status: "idle" | "recovering" | "failed";
    reason: string | null;
    lastRecoveryAt: string | null;
    lastErrorCode: string | null;
    attemptCount: number | null;
    nextRetryInSeconds: number | null;
    log: {
      at: string;
      result: "success" | "failed";
      reason: string | null;
    }[];
  };
};

function sanitizeForDashboard(payload: HealthPayload): HealthPayload {
  const sanitizedReason =
    payload.recovery.status === "failed"
      ? "Recovery requires operator attention."
      : payload.recovery.status === "recovering"
        ? "Recovery in progress."
        : null;

  return {
    ...payload,
    autonomyMode: {
      ...payload.autonomyMode,
      bridgeAuth: {
        ...payload.autonomyMode.bridgeAuth,
        history: [],
      },
    },
    recovery: {
      ...payload.recovery,
      reason: sanitizedReason,
      log: [],
    },
  };
}

function parseIso(value: string | undefined): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function parseSignal(line: string): RecoverySignal | null {
  const matched = line.match(/\bsignal(?: detected)?:\s*(401|500)\b/i) ?? line.match(/\bsignal=(401|500)\b/i);
  if (!matched) return null;
  return matched[1] === "401" || matched[1] === "500" ? matched[1] : null;
}

function parseRecoveryLog(lines: string[]): HealthPayload["recovery"]["log"] {
  const log: HealthPayload["recovery"]["log"] = [];
  for (const line of lines) {
    if (!line.includes("recovery result=")) continue;

    const match = line.match(/^\[([^\]]+)\]\s+(.*)$/);
    if (!match) continue;

    const eventAt = parseIso(match[1]);
    if (!eventAt) continue;

    const message = match[2];
    const resultMatch = message.match(/\brecovery result=(success|failed)\b/i);
    const reasonMatch = message.match(/\breason=(.*)$/i);
    const result = resultMatch?.[1]?.toLowerCase() === "success" ? "success" : "failed";

    log.push({
      at: eventAt,
      result,
      reason: reasonMatch?.[1]?.trim() || null
    });
  }
  return log.slice(-10).reverse();
}

function parseLog(lines: string[]): LogMeta {
  const summary: LogMeta = {
    lastSignalAt: null,
    lastSignalCode: null,
    lastResultAt: null,
    lastResultCode: null,
    lastResult: null,
    lastResultReason: null,
    lastRestartAt: null,
    lastTokenRefreshAt: null
  };

  for (const line of lines) {
    const match = line.match(/^\[([^\]]+)\]\s+(.*)$/);
    if (!match) continue;

    const eventAt = parseIso(match[1]);
    if (!eventAt) continue;
    const message = match[2];

    if (message.includes("signal detected:")) {
      const signal = parseSignal(message);
      if (signal) {
        summary.lastSignalAt = eventAt;
        summary.lastSignalCode = signal;
      }
      continue;
    }

    if (message.includes("recovery result=")) {
      const signal = parseSignal(message);
      const resultMatch = message.match(/\brecovery result=(success|failed)\b/i);
      const reasonMatch = message.match(/\breason=(.*)$/i);
      const result = resultMatch?.[1]?.toLowerCase() === "success" ? "success" : "failed";
      summary.lastResultAt = eventAt;
      summary.lastResultCode = signal;
      summary.lastResult = result;
      summary.lastResultReason = reasonMatch?.[1]?.trim() || null;

      if (result === "success" && signal === "500") {
        summary.lastRestartAt = eventAt;
      }
      if (result === "success" && signal === "401") {
        summary.lastTokenRefreshAt = eventAt;
      }
    }
  }

  return summary;
}

async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function safeReadLines(filePath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function resolveWatchdogArtifactPath(
  envOverride: string | undefined,
  candidates: string[]
): Promise<string> {
  const override = envOverride?.trim();
  if (override) {
    return override;
  }

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return candidates[0];
}

export async function GET(request: Request) {
  const viewParam = (() => {
    try {
      return new URL(request.url).searchParams.get("view");
    } catch {
      return null;
    }
  })();
  const isOpsView = viewParam === "ops";
  const checkedAt = new Date();

  try {
    await fs.access(path.join(process.cwd(), "tmp/SIMULATE_500"));
    return new Response(JSON.stringify({ ok: false, error: "Simulated 500 error" }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  } catch {
    // Continue normally
  }

  const pollIntervalSeconds = Math.max(Number(process.env.PICTRONIC_WATCHDOG_POLL_INTERVAL_SECONDS ?? "2"), 1);
  const [watchdogStatePath, watchdogLogPath] = await Promise.all([
    resolveWatchdogArtifactPath(process.env.PICTRONIC_WATCHDOG_STATE_PATH, [
      path.join(process.cwd(), "docs/e2e/pictronic-watchdog.state.json"),
      path.join(process.cwd(), "docs/e2e/pictronic-watchdog.state.json")
    ]),
    resolveWatchdogArtifactPath(process.env.PICTRONIC_WATCHDOG_LOG_PATH, [
      path.join(process.cwd(), "docs/e2e/pictronic-watchdog-recovery.log"),
      path.join(process.cwd(), "docs/e2e/pictronic-watchdog-recovery.log")
    ])
  ]);

  const [state, logLines] = await Promise.all([
    safeReadJson<WatchdogState>(watchdogStatePath),
    safeReadLines(watchdogLogPath)
  ]);
  const authCounters = getBridgeAuthDecisionCounters();
  const authHistory = getBridgeAuthDecisionHistory(10).filter((item) => item.errorClass !== null);
  const lastAuthError = authHistory[0] ?? null;
  const logMeta = parseLog(logLines);

  const lastSuccessAt = parseIso(state?.last_success_at);
  const lastFailureAt = parseIso(state?.last_failure_at);
  const hasUnresolvedFailure =
    Boolean(lastFailureAt) && (!lastSuccessAt || new Date(lastFailureAt as string).getTime() > new Date(lastSuccessAt).getTime());
  const selfHealingActive = Boolean(state || logLines.length > 0);
  const recoveryInProgress =
    Boolean(logMeta.lastSignalAt) &&
    (!logMeta.lastResultAt || new Date(logMeta.lastSignalAt as string).getTime() > new Date(logMeta.lastResultAt).getTime());

  const lastRestartAt = logMeta.lastRestartAt;
  const lastTokenRefreshAt = logMeta.lastTokenRefreshAt;
  const latestRecoveryAt = logMeta.lastResult === "success" ? logMeta.lastResultAt : lastSuccessAt;
  const latestErrorCode =
    logMeta.lastResult === "failed" && logMeta.lastResultCode
      ? `WATCHDOG_SIGNAL_${logMeta.lastResultCode}`
      : hasUnresolvedFailure && state?.last_failure_reason
        ? "WATCHDOG_RECOVERY_FAILED"
        : null;

  let status: HealthStatus = "ok";
  let autonomyReason = "Watchdog automation configured and monitoring runtime recovery.";
  if (!selfHealingActive) {
    status = "degraded";
    autonomyReason = "Watchdog telemetry unavailable. Automation is considered inactive.";
  } else if (logMeta.lastResult === "failed" || hasUnresolvedFailure) {
    status = "failed";
    autonomyReason = "Most recent watchdog recovery attempt failed.";
  } else if (recoveryInProgress) {
    status = "degraded";
    autonomyReason = "Watchdog is processing a recovery signal.";
  }

  const payload: HealthPayload = {
    status,
    service: "pictronic-runtime",
    checkedAt: checkedAt.toISOString(),
    autonomyMode: {
      selfHealingActive,
      status: selfHealingActive ? "active" : "inactive",
      reason: autonomyReason,
      lastRestartAt,
      lastTokenRefreshAt,
      nextWatchdogCheckAt: selfHealingActive
        ? new Date(checkedAt.getTime() + pollIntervalSeconds * 1000).toISOString()
        : null,
      pollIntervalSeconds,
      latestSignalCode: logMeta.lastSignalCode,
      latestSignalAt: logMeta.lastSignalAt,
      bridgeAuth: {
        lastErrorClass: lastAuthError?.errorClass ?? null,
        lastErrorAt: lastAuthError?.at ?? null,
        counters: {
          invalid: authCounters.invalid,
          revoked: authCounters.revoked,
          expired: authCounters.expired,
          tokenNodeMismatch: authCounters.mismatch,
          missingNode: authCounters.missingNode,
        },
        history: authHistory.map((entry) => ({
          at: entry.at,
          errorClass: entry.errorClass as BridgeAuthErrorClass,
          nodeId: entry.nodeId,
          tokenId: entry.tokenId,
          reason: entry.reason,
        })),
      },
    },
    recovery: {
      inProgress: recoveryInProgress,
      status: recoveryInProgress
        ? "recovering"
        : status === "failed"
          ? "failed"
          : "idle",
      reason: logMeta.lastResultReason ?? (hasUnresolvedFailure ? state?.last_failure_reason : null) ?? null,
      lastRecoveryAt: latestRecoveryAt,
      lastErrorCode: latestErrorCode,
      attemptCount: null,
      nextRetryInSeconds: selfHealingActive ? pollIntervalSeconds : null,
      log: parseRecoveryLog(logLines)
    }
  };

  if (lastFailureAt && (!lastSuccessAt || new Date(lastFailureAt).getTime() > new Date(lastSuccessAt).getTime())) {
    payload.recovery.status = "failed";
  }

  return jsonOk(isOpsView ? payload : sanitizeForDashboard(payload));
}
