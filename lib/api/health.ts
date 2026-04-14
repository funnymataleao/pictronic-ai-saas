"use client";

import type { RuntimeReadinessPayload } from "./contracts";

export type InfrastructureState = "healthy" | "degraded" | "recovering" | "failed";

export type RuntimeHealthProbe = {
  ok: boolean;
  statusCode: number | null;
  reason: string | null;
  payload: unknown | null;
};

export type RuntimeHealthSnapshot = {
  apiStatus: "ok" | "degraded" | "failed" | "unknown";
  recoveryInProgress: boolean;
  recoveryReason: string | null;
  lastRecoveryAt: string | null;
  lastErrorCode: string | null;
  attemptCount: number | null;
  nextRetryIn: number | null;
  autonomyMode: {
    selfHealingActive: boolean;
    reason: string | null;
    lastRestartAt: string | null;
    lastTokenRefreshAt: string | null;
    nextWatchdogCheckAt: string | null;
    pollIntervalSeconds: number | null;
    latestSignalCode: string | null;
    latestSignalAt: string | null;
    bridgeAuth: {
      lastErrorClass: "invalid" | "revoked" | "expired" | "token-node-mismatch" | "missing-node" | null;
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
        errorClass: "invalid" | "revoked" | "expired" | "token-node-mismatch" | "missing-node";
        nodeId: string | null;
        tokenId: string | null;
        reason: string;
      }[];
    };
  };
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asPositiveNumber(value: unknown): number | null {
  const numeric = asNumber(value);
  if (numeric === null) return null;
  return numeric > 0 ? numeric : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrapData(input: unknown): unknown {
  if (!isObject(input)) return input;
  if ("ok" in input && typeof input.ok === "boolean" && "data" in input) {
    return input.data;
  }
  return input;
}

function readPath(root: unknown, path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

function normalizeHealthStatus(rawStatus: unknown): RuntimeHealthSnapshot["apiStatus"] {
  if (typeof rawStatus !== "string") return "unknown";
  const normalized = rawStatus.toLowerCase();
  if (normalized === "ok") return "ok";
  if (normalized === "degraded") return "degraded";
  if (normalized === "failed") return "failed";
  if (normalized === "healthy") return "ok";
  if (normalized === "offline") return "failed";
  return "unknown";
}

export function extractRuntimeHealthSnapshot(probe: RuntimeHealthProbe): RuntimeHealthSnapshot {
  const payload = unwrapData(probe.payload);
  const recoveryCandidate = readPath(payload, ["recovery"]);
  const recovery = isObject(recoveryCandidate) ? recoveryCandidate : {};
  const autonomyCandidate = readPath(payload, ["autonomyMode"]);
  const autonomyMode = isObject(autonomyCandidate) ? autonomyCandidate : {};
  const healthStatus =
    readPath(payload, ["status"]) ??
    readPath(payload, ["overallStatus"]) ??
    readPath(payload, ["health", "status"]) ??
    readPath(payload, ["recovery", "status"]);
  const recoveryStatus = asString(readPath(payload, ["recovery", "status"]))?.toLowerCase();
  const recoveryInProgress =
    readPath(payload, ["recovery", "inProgress"]) === true ||
    readPath(payload, ["recovery", "active"]) === true ||
    readPath(payload, ["recovery", "recovering"]) === true ||
    recoveryStatus === "recovering" ||
    recoveryStatus === "in_progress";

  const nextRetryIn =
    asNumber(readPath(recovery, ["nextRetryIn"])) ??
    asNumber(readPath(recovery, ["nextRetryInSeconds"])) ??
    asNumber(readPath(payload, ["nextRetryIn"])) ??
    null;
  const attemptCount =
    asNumber(readPath(recovery, ["attemptCount"])) ??
    asNumber(readPath(payload, ["attemptCount"])) ??
    null;
  const lastRecoveryAt =
    asString(readPath(recovery, ["lastRecoveryAt"])) ??
    asString(readPath(payload, ["lastRecoveryAt"])) ??
    null;
  const lastErrorCode =
    asString(readPath(recovery, ["lastErrorCode"])) ??
    asString(readPath(payload, ["lastErrorCode"])) ??
    null;
  const recoveryReason =
    asString(readPath(recovery, ["reason"])) ??
    asString(readPath(payload, ["message"])) ??
    null;
  const selfHealingActive =
    asBoolean(readPath(autonomyMode, ["selfHealingActive"])) ??
    (asString(readPath(autonomyMode, ["status"]))?.toLowerCase() === "active");
  const pollIntervalSeconds =
    asPositiveNumber(readPath(autonomyMode, ["pollIntervalSeconds"])) ??
    asPositiveNumber(readPath(recovery, ["nextRetryInSeconds"])) ??
    asPositiveNumber(readPath(recovery, ["nextRetryIn"])) ??
    asPositiveNumber(readPath(payload, ["nextRetryIn"])) ??
    null;
  const bridgeAuthCandidate = readPath(autonomyMode, ["bridgeAuth"]);
  const bridgeAuth = isObject(bridgeAuthCandidate) ? bridgeAuthCandidate : {};
  const bridgeAuthHistoryRaw = readPath(bridgeAuth, ["history"]);
  const bridgeAuthHistory = Array.isArray(bridgeAuthHistoryRaw)
    ? bridgeAuthHistoryRaw
        .filter((item): item is Record<string, unknown> => isObject(item))
        .map((item) => ({
          at: asString(item.at) ?? new Date(0).toISOString(),
          errorClass:
            asString(item.errorClass) === "invalid" ||
            asString(item.errorClass) === "revoked" ||
            asString(item.errorClass) === "expired" ||
            asString(item.errorClass) === "token-node-mismatch" ||
            asString(item.errorClass) === "missing-node"
              ? (asString(item.errorClass) as "invalid" | "revoked" | "expired" | "token-node-mismatch" | "missing-node")
              : "invalid",
          nodeId: asString(item.nodeId),
          tokenId: asString(item.tokenId),
          reason: asString(item.reason) ?? "unknown",
        }))
        .filter((item) => item.at !== new Date(0).toISOString())
    : [];

  return {
    apiStatus: normalizeHealthStatus(healthStatus),
    recoveryInProgress,
    recoveryReason,
    lastRecoveryAt,
    lastErrorCode,
    attemptCount,
    nextRetryIn,
    autonomyMode: {
      selfHealingActive,
      reason: asString(readPath(autonomyMode, ["reason"])),
      lastRestartAt: asString(readPath(autonomyMode, ["lastRestartAt"])),
      lastTokenRefreshAt: asString(readPath(autonomyMode, ["lastTokenRefreshAt"])),
      nextWatchdogCheckAt: asString(readPath(autonomyMode, ["nextWatchdogCheckAt"])),
      pollIntervalSeconds,
      latestSignalCode: asString(readPath(autonomyMode, ["latestSignalCode"])),
      latestSignalAt: asString(readPath(autonomyMode, ["latestSignalAt"])),
      bridgeAuth: {
        lastErrorClass:
          asString(readPath(bridgeAuth, ["lastErrorClass"])) === "invalid" ||
          asString(readPath(bridgeAuth, ["lastErrorClass"])) === "revoked" ||
          asString(readPath(bridgeAuth, ["lastErrorClass"])) === "expired" ||
          asString(readPath(bridgeAuth, ["lastErrorClass"])) === "token-node-mismatch" ||
          asString(readPath(bridgeAuth, ["lastErrorClass"])) === "missing-node"
            ? (asString(readPath(bridgeAuth, ["lastErrorClass"])) as
                | "invalid"
                | "revoked"
                | "expired"
                | "token-node-mismatch"
                | "missing-node")
            : null,
        lastErrorAt: asString(readPath(bridgeAuth, ["lastErrorAt"])),
        counters: {
          invalid: asNumber(readPath(bridgeAuth, ["counters", "invalid"])) ?? 0,
          revoked: asNumber(readPath(bridgeAuth, ["counters", "revoked"])) ?? 0,
          expired: asNumber(readPath(bridgeAuth, ["counters", "expired"])) ?? 0,
          tokenNodeMismatch: asNumber(readPath(bridgeAuth, ["counters", "tokenNodeMismatch"])) ?? 0,
          missingNode: asNumber(readPath(bridgeAuth, ["counters", "missingNode"])) ?? 0,
        },
        history: bridgeAuthHistory,
      },
    }
  };
}

export async function getRuntimeHealthProbe(): Promise<RuntimeHealthProbe> {
  const HEALTH_ROUTE_PATH = "/api/health?view=dashboard";
  try {
    const response = await fetch(HEALTH_ROUTE_PATH, { cache: "no-store" });
    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.toLowerCase().includes("application/json");
    if (!isJson) {
      return {
        ok: false,
        statusCode: response.status,
        reason: `Health probe unavailable (${response.status}, ${contentType || "non-json"}).`,
        payload: null
      };
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        reason: `Health probe failed with HTTP ${response.status}.`,
        payload
      };
    }

    return {
      ok: true,
      statusCode: response.status,
      reason: null,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      reason: error instanceof Error ? error.message : "Unexpected error",
      payload: null
    };
  }
}

export function computeInfrastructureRecovery(
  readiness: RuntimeReadinessPayload | null,
  healthProbe: RuntimeHealthProbe,
  healthSnapshot: RuntimeHealthSnapshot
) {
  const readinessState: InfrastructureState =
    readiness?.overallStatus === "online"
      ? "healthy"
      : readiness?.overallStatus === "degraded"
        ? "degraded"
        : "failed";

  const healthState: InfrastructureState =
    healthSnapshot.apiStatus === "ok"
      ? "healthy"
      : healthSnapshot.apiStatus === "degraded"
        ? "degraded"
        : healthSnapshot.apiStatus === "failed"
          ? "failed"
          : "degraded";

  let status: InfrastructureState = "healthy";
  if (healthSnapshot.recoveryInProgress) {
    status = "recovering";
  } else if (readinessState === "failed" || healthState === "failed") {
    status = "failed";
  } else if (readinessState === "degraded" || healthState === "degraded") {
    status = "degraded";
  }

  const blockedReadiness = readiness?.dependencies.filter((d) => d.status === "offline") ?? [];
  const reasons = [
    ...blockedReadiness.map((dependency) => `${dependency.label}: ${dependency.message}`),
    healthProbe.reason,
    healthSnapshot.recoveryReason
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  return {
    status,
    reasons: Array.from(new Set(reasons))
  };
}
