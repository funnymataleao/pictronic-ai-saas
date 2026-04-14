import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { ApiError } from "@/lib/api/http";
import { fakeId, nowIso } from "@/lib/api/mock-store";

export type BridgeNodeStatus = "online" | "offline";
export type BridgeJobStatus = "queued" | "leased" | "completed" | "failed";
export type BridgeJobSettlementOutcome = "ack" | "retry" | "fail";

export interface BridgeNodeRecord {
  nodeId: string;
  machineId: string;
  capabilities: string[];
  status: BridgeNodeStatus;
  registeredAt: string;
  lastSeenAt: string;
  updatedAt: string;
}

export interface BridgeJobRecord {
  jobId: string;
  kind: string;
  status: BridgeJobStatus;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  failureReason?: string;
  attemptsMade: number;
  maxAttempts: number;
  backoffMs: number;
  availableAt: string;
  leasedByNodeId?: string;
  leaseId?: string;
  leaseExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface BridgeTokenRecord {
  tokenId: string;
  nodeId: string;
  tokenHash: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
}

interface BridgeAuthDecisionCounters {
  accepted: number;
  revoked: number;
  expired: number;
  invalid: number;
  missingNode: number;
  mismatch: number;
}

export type BridgeAuthErrorClass =
  | "invalid"
  | "revoked"
  | "expired"
  | "token-node-mismatch"
  | "missing-node";

interface BridgeAuthDecisionEvent {
  at: string;
  decision: keyof BridgeAuthDecisionCounters;
  errorClass: BridgeAuthErrorClass | null;
  nodeId: string | null;
  tokenId: string | null;
  reason: string;
}

interface BridgeRuntimeState {
  nodes: Map<string, BridgeNodeRecord>;
  tokensByHash: Map<string, BridgeTokenRecord>;
  latestTokenByNodeId: Map<string, string>;
  jobsById: Map<string, BridgeJobRecord>;
  jobOrder: string[];
  authDecisions: BridgeAuthDecisionCounters;
  authHistory: BridgeAuthDecisionEvent[];
}

interface IssueConnectionTokenResult {
  token: string;
  tokenId: string;
  issuedAt: string;
  expiresAt: string;
}

interface AuthenticatedNodeResult {
  node: BridgeNodeRecord;
  tokenId: string;
  expiresAt: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __pictronicBridgeRuntime__: BridgeRuntimeState | undefined;
}

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24;
const MAX_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_ACTIVE_TOKEN_HISTORY_LIMIT = 6;
const MAX_ACTIVE_TOKEN_HISTORY_LIMIT = 50;
const DEFAULT_REVOKED_TOKEN_RETENTION_SECONDS = 5 * 60;
const MAX_REVOKED_TOKEN_RETENTION_SECONDS = 60 * 60 * 24;
const DEFAULT_JOB_MAX_ATTEMPTS = 5;
const DEFAULT_JOB_BACKOFF_MS = 10_000;
const DEFAULT_LEASE_TTL_SECONDS = 30;
const MAX_LEASE_TTL_SECONDS = 300;
const PROJECT_ROOT = process.env.PICTRONIC_PROJECT_ROOT?.trim()
  ? path.resolve(process.env.PICTRONIC_PROJECT_ROOT)
  : process.cwd();
const AUTH_STATE_FILE = process.env.BRIDGE_AUTH_STATE_FILE
  ? path.resolve(process.env.BRIDGE_AUTH_STATE_FILE)
  : path.join(PROJECT_ROOT, "tmp", "bridge-auth-state.json");

function getBridgeRuntimeState(): BridgeRuntimeState {
  if (!globalThis.__pictronicBridgeRuntime__) {
    globalThis.__pictronicBridgeRuntime__ = {
      nodes: new Map<string, BridgeNodeRecord>(),
      tokensByHash: new Map<string, BridgeTokenRecord>(),
      latestTokenByNodeId: new Map<string, string>(),
      jobsById: new Map<string, BridgeJobRecord>(),
      jobOrder: [],
      authDecisions: {
        accepted: 0,
        revoked: 0,
        expired: 0,
        invalid: 0,
        missingNode: 0,
        mismatch: 0,
      },
      authHistory: [],
    };
  } else if (!globalThis.__pictronicBridgeRuntime__.authDecisions) {
    globalThis.__pictronicBridgeRuntime__.authDecisions = {
      accepted: 0,
      revoked: 0,
      expired: 0,
      invalid: 0,
      missingNode: 0,
      mismatch: 0,
    };
  } else if (globalThis.__pictronicBridgeRuntime__.authDecisions.mismatch === undefined) {
    globalThis.__pictronicBridgeRuntime__.authDecisions.mismatch = 0;
  }
  if (!globalThis.__pictronicBridgeRuntime__.authHistory) {
    globalThis.__pictronicBridgeRuntime__.authHistory = [];
  }
  return globalThis.__pictronicBridgeRuntime__;
}

const state = getBridgeRuntimeState();

interface BridgeAuthStateSnapshot {
  nodes: BridgeNodeRecord[];
  tokens: BridgeTokenRecord[];
  tokensByNodeId?: BridgeTokenRecord[];
}

let authStateMtimeMs = 0;

function loadAuthStateSnapshot(options?: { force?: boolean }): BridgeAuthStateSnapshot | null {
  const force = options?.force ?? false;
  try {
    const stat = fs.statSync(AUTH_STATE_FILE);
    if (!stat.isFile()) {
      return null;
    }

    if (!force && stat.mtimeMs === authStateMtimeMs) {
      return null;
    }

    const raw = fs.readFileSync(AUTH_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<BridgeAuthStateSnapshot>;
    if (!parsed || !Array.isArray(parsed.nodes)) {
      return null;
    }
    const parsedTokens = Array.isArray(parsed.tokens) ? parsed.tokens : parsed.tokensByNodeId;
    if (!Array.isArray(parsedTokens)) {
      return null;
    }

    authStateMtimeMs = stat.mtimeMs;
    return {
      nodes: parsed.nodes.filter((item): item is BridgeNodeRecord => Boolean(item && item.nodeId)),
      tokens: parsedTokens.filter(
        (item): item is BridgeTokenRecord => Boolean(item && item.nodeId && item.tokenHash)
      ),
    };
  } catch {
    return null;
  }
}

function syncAuthStateFromDisk(options?: { force?: boolean }): boolean {
  const snapshot = loadAuthStateSnapshot(options);
  if (!snapshot) {
    return false;
  }

  state.nodes = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
  state.tokensByHash = new Map(snapshot.tokens.map((token) => [token.tokenHash, token]));
  state.latestTokenByNodeId = new Map<string, string>();
  for (const token of snapshot.tokens) {
    const previousHash = state.latestTokenByNodeId.get(token.nodeId);
    const previous = previousHash ? state.tokensByHash.get(previousHash) : undefined;
    if (!previous || token.issuedAt > previous.issuedAt) {
      state.latestTokenByNodeId.set(token.nodeId, token.tokenHash);
    }
  }
  return true;
}

function persistAuthStateToDisk(): void {
  const dir = path.dirname(AUTH_STATE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const payload: BridgeAuthStateSnapshot = {
    nodes: Array.from(state.nodes.values()),
    tokens: Array.from(state.tokensByHash.values()),
    tokensByNodeId: Array.from(state.latestTokenByNodeId.values())
      .map((tokenHash) => state.tokensByHash.get(tokenHash))
      .filter((token): token is BridgeTokenRecord => Boolean(token)),
  };
  const tmp = `${AUTH_STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, AUTH_STATE_FILE);
  const stat = fs.statSync(AUTH_STATE_FILE);
  authStateMtimeMs = stat.mtimeMs;
}

function toTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parsePositiveIntegerEnv(name: string, fallback: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return fallback;
  }

  return Math.min(value, max);
}

function getActiveTokenHistoryLimit(): number {
  return parsePositiveIntegerEnv("BRIDGE_ACTIVE_TOKEN_HISTORY_LIMIT", DEFAULT_ACTIVE_TOKEN_HISTORY_LIMIT, MAX_ACTIVE_TOKEN_HISTORY_LIMIT);
}

function getRevokedTokenRetentionSeconds(): number {
  return parsePositiveIntegerEnv(
    "BRIDGE_REVOKED_TOKEN_RETENTION_SECONDS",
    DEFAULT_REVOKED_TOKEN_RETENTION_SECONDS,
    MAX_REVOKED_TOKEN_RETENTION_SECONDS
  );
}

function rebuildLatestTokenByNodeId(): void {
  state.latestTokenByNodeId = new Map<string, string>();
  for (const token of state.tokensByHash.values()) {
    if (token.revokedAt) {
      continue;
    }
    const previousHash = state.latestTokenByNodeId.get(token.nodeId);
    const previous = previousHash ? state.tokensByHash.get(previousHash) : undefined;
    if (!previous || token.issuedAt > previous.issuedAt) {
      state.latestTokenByNodeId.set(token.nodeId, token.tokenHash);
    }
  }
}

function pruneTokenState(): boolean {
  const nowMs = Date.now();
  const revokedRetentionMs = getRevokedTokenRetentionSeconds() * 1000;
  const beforeCount = state.tokensByHash.size;

  for (const [tokenHash, token] of state.tokensByHash.entries()) {
    const expiresAtMs = new Date(token.expiresAt).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
      state.tokensByHash.delete(tokenHash);
      continue;
    }

    if (token.revokedAt) {
      const revokedAtMs = new Date(token.revokedAt).getTime();
      if (!Number.isFinite(revokedAtMs) || revokedAtMs + revokedRetentionMs <= nowMs) {
        state.tokensByHash.delete(tokenHash);
      }
    }
  }

  const activeByNode = new Map<string, BridgeTokenRecord[]>();
  for (const token of state.tokensByHash.values()) {
    if (token.revokedAt) {
      continue;
    }
    const bucket = activeByNode.get(token.nodeId);
    if (bucket) {
      bucket.push(token);
    } else {
      activeByNode.set(token.nodeId, [token]);
    }
  }

  const historyLimit = getActiveTokenHistoryLimit();
  for (const tokens of activeByNode.values()) {
    tokens.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    if (tokens.length <= historyLimit) {
      continue;
    }

    for (const stale of tokens.slice(historyLimit)) {
      state.tokensByHash.delete(stale.tokenHash);
    }
  }

  rebuildLatestTokenByNodeId();
  return state.tokensByHash.size !== beforeCount;
}

function recordAuthDecision(
  decision: keyof BridgeAuthDecisionCounters,
  details: { nodeId?: string; tokenId?: string; reason: string }
): void {
  state.authDecisions[decision] += 1;
  const errorClass: BridgeAuthDecisionEvent["errorClass"] =
    decision === "invalid"
      ? "invalid"
      : decision === "revoked"
        ? "revoked"
        : decision === "expired"
          ? "expired"
          : decision === "missingNode"
            ? "missing-node"
            : decision === "mismatch"
              ? "token-node-mismatch"
              : null;

  state.authHistory.push({
    at: nowIso(),
    decision,
    errorClass,
    nodeId: details.nodeId ?? null,
    tokenId: details.tokenId ?? null,
    reason: details.reason,
  });
  if (state.authHistory.length > 25) {
    state.authHistory = state.authHistory.slice(-25);
  }
  console.info("[bridge.auth] decision", {
    decision,
    nodeId: details.nodeId ?? null,
    tokenId: details.tokenId ?? null,
    reason: details.reason,
    counters: state.authDecisions,
  });
}

function asTtlSeconds(ttlSeconds?: number): number {
  if (ttlSeconds === undefined) {
    return DEFAULT_TOKEN_TTL_SECONDS;
  }

  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > MAX_TOKEN_TTL_SECONDS) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `Field 'ttlSeconds' must be an integer in range 60..${MAX_TOKEN_TTL_SECONDS}`
    );
  }

  return ttlSeconds;
}

function asLeaseTtlSeconds(leaseTtlSeconds?: number): number {
  if (leaseTtlSeconds === undefined) {
    return DEFAULT_LEASE_TTL_SECONDS;
  }

  if (!Number.isInteger(leaseTtlSeconds) || leaseTtlSeconds < 5 || leaseTtlSeconds > MAX_LEASE_TTL_SECONDS) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `Field 'leaseTtlSeconds' must be an integer in range 5..${MAX_LEASE_TTL_SECONDS}`
    );
  }

  return leaseTtlSeconds;
}

function asJobMaxAttempts(maxAttempts?: number): number {
  if (maxAttempts === undefined) {
    return DEFAULT_JOB_MAX_ATTEMPTS;
  }

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new ApiError(400, "VALIDATION_ERROR", "Field 'maxAttempts' must be an integer in range 1..20");
  }

  return maxAttempts;
}

function asBackoffMs(backoffMs?: number): number {
  if (backoffMs === undefined) {
    return DEFAULT_JOB_BACKOFF_MS;
  }

  if (!Number.isInteger(backoffMs) || backoffMs < 0 || backoffMs > 300_000) {
    throw new ApiError(400, "VALIDATION_ERROR", "Field 'backoffMs' must be an integer in range 0..300000");
  }

  return backoffMs;
}

function issueConnectionToken(
  nodeId: string,
  ttlSeconds?: number,
  options?: { revokePreviousTokens?: boolean }
): IssueConnectionTokenResult {
  syncAuthStateFromDisk();
  if (pruneTokenState()) {
    persistAuthStateToDisk();
  }
  const ttl = asTtlSeconds(ttlSeconds);
  const issuedAt = nowIso();
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const tokenId = fakeId("ctk");
  const rawToken = `pct_${fakeId("bridge")}_${fakeId("secret")}`;
  const tokenHash = toTokenHash(rawToken);
  if (options?.revokePreviousTokens) {
    for (const existing of state.tokensByHash.values()) {
      if (existing.nodeId === nodeId && !existing.revokedAt) {
        existing.revokedAt = issuedAt;
      }
    }
  }

  const created: BridgeTokenRecord = {
    tokenId,
    nodeId,
    tokenHash,
    issuedAt,
    expiresAt,
  };

  state.tokensByHash.set(tokenHash, created);
  state.latestTokenByNodeId.set(nodeId, tokenHash);
  pruneTokenState();
  persistAuthStateToDisk();

  return {
    token: rawToken,
    tokenId,
    issuedAt,
    expiresAt,
  };
}

export function registerNode(input: {
  nodeId?: string;
  machineId: string;
  capabilities?: string[];
  ttlSeconds?: number;
}): { node: BridgeNodeRecord; connectionToken: IssueConnectionTokenResult } {
  syncAuthStateFromDisk();
  const now = nowIso();
  const nodeId = input.nodeId ?? fakeId("node");

  const existing = state.nodes.get(nodeId);
  const capabilities = input.capabilities ?? [];

  const node: BridgeNodeRecord = {
    nodeId,
    machineId: input.machineId,
    capabilities,
    status: "online",
    registeredAt: existing?.registeredAt ?? now,
    lastSeenAt: now,
    updatedAt: now,
  };

  state.nodes.set(nodeId, node);

  const connectionToken = issueConnectionToken(nodeId, input.ttlSeconds);
  persistAuthStateToDisk();
  return { node, connectionToken };
}

export function rotateConnectionToken(input: {
  nodeId: string;
  ttlSeconds?: number;
}): { node: BridgeNodeRecord; connectionToken: IssueConnectionTokenResult } {
  syncAuthStateFromDisk();
  const node = state.nodes.get(input.nodeId);
  if (!node) {
    throw new ApiError(404, "NODE_NOT_FOUND", `Node '${input.nodeId}' was not found`);
  }

  const connectionToken = issueConnectionToken(input.nodeId, input.ttlSeconds, {
    revokePreviousTokens: true,
  });
  node.updatedAt = nowIso();
  state.nodes.set(input.nodeId, node);
  persistAuthStateToDisk();

  return { node, connectionToken };
}

function getNodeByToken(token: string): AuthenticatedNodeResult {
  syncAuthStateFromDisk();
  if (pruneTokenState()) {
    persistAuthStateToDisk();
  }
  const tokenHash = toTokenHash(token);
  let tokenRecord = state.tokensByHash.get(tokenHash);

  if (!tokenRecord) {
    const reloaded = syncAuthStateFromDisk({ force: true });
    if (reloaded) {
      if (pruneTokenState()) {
        persistAuthStateToDisk();
      }
      tokenRecord = state.tokensByHash.get(tokenHash);
    }
  }

  if (!tokenRecord) {
    recordAuthDecision("invalid", { reason: "token_not_found" });
    throw new ApiError(401, "UNAUTHORIZED", "Invalid connection token");
  }

  const nodeId = tokenRecord.nodeId;

  if (tokenRecord.revokedAt) {
    recordAuthDecision("revoked", {
      nodeId,
      tokenId: tokenRecord.tokenId,
      reason: "token_revoked",
    });
    throw new ApiError(401, "UNAUTHORIZED", "Connection token has been revoked");
  }

  if (new Date(tokenRecord.expiresAt).getTime() <= Date.now()) {
    state.tokensByHash.delete(tokenRecord.tokenHash);
    rebuildLatestTokenByNodeId();
    persistAuthStateToDisk();
    recordAuthDecision("expired", {
      nodeId,
      tokenId: tokenRecord.tokenId,
      reason: "token_expired",
    });
    throw new ApiError(401, "UNAUTHORIZED", "Connection token has expired");
  }

  const node = state.nodes.get(nodeId);
  if (!node) {
    recordAuthDecision("missingNode", {
      nodeId,
      tokenId: tokenRecord.tokenId,
      reason: "node_not_found_for_token",
    });
    throw new ApiError(401, "UNAUTHORIZED", "Connection token is bound to missing node");
  }

  recordAuthDecision("accepted", {
    nodeId,
    tokenId: tokenRecord.tokenId,
    reason: "token_accepted",
  });
  return {
    node,
    tokenId: tokenRecord.tokenId,
    expiresAt: tokenRecord.expiresAt,
  };
}

function requireJob(jobId: string): BridgeJobRecord {
  const job = state.jobsById.get(jobId);
  if (!job) {
    throw new ApiError(404, "JOB_NOT_FOUND", `Job '${jobId}' was not found`);
  }
  return job;
}

function clearLease(job: BridgeJobRecord): void {
  job.leasedByNodeId = undefined;
  job.leaseId = undefined;
  job.leaseExpiresAt = undefined;
}

function refreshExpiredLeases(): void {
  const now = Date.now();

  for (const job of state.jobsById.values()) {
    if (job.status !== "leased" || !job.leaseExpiresAt) {
      continue;
    }

    const leaseExpiresAtMs = new Date(job.leaseExpiresAt).getTime();
    if (leaseExpiresAtMs > now) {
      continue;
    }

    const updatedAt = nowIso();
    if (job.attemptsMade >= job.maxAttempts) {
      job.status = "failed";
      job.failureReason = job.failureReason ?? "Lease expired and retry budget exhausted";
      job.completedAt = updatedAt;
      clearLease(job);
      job.updatedAt = updatedAt;
      continue;
    }

    job.status = "queued";
    job.availableAt = new Date(now + job.backoffMs).toISOString();
    clearLease(job);
    job.updatedAt = updatedAt;
  }
}

export function acceptHeartbeat(input: {
  connectionToken: string;
  nodeId: string;
  machineId?: string;
  capabilities?: string[];
}): { node: BridgeNodeRecord; tokenId: string; expiresAt: string } {
  syncAuthStateFromDisk();
  const auth = getNodeByToken(input.connectionToken);

  if (auth.node.nodeId !== input.nodeId) {
    recordAuthDecision("mismatch", {
      nodeId: input.nodeId,
      tokenId: auth.tokenId,
      reason: "token_node_mismatch",
    });
    throw new ApiError(403, "FORBIDDEN", "Connection token is not valid for this node");
  }

  const now = nowIso();
  auth.node.status = "online";
  auth.node.lastSeenAt = now;
  auth.node.updatedAt = now;

  if (input.machineId) {
    auth.node.machineId = input.machineId;
  }

  if (input.capabilities) {
    auth.node.capabilities = input.capabilities;
  }

  state.nodes.set(auth.node.nodeId, auth.node);
  persistAuthStateToDisk();

  return {
    node: auth.node,
    tokenId: auth.tokenId,
    expiresAt: auth.expiresAt,
  };
}

export function enqueueBridgeJob(input: {
  kind: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
  backoffMs?: number;
}): BridgeJobRecord {
  const jobId = fakeId("bjob");
  const now = nowIso();
  const job: BridgeJobRecord = {
    jobId,
    kind: input.kind,
    status: "queued",
    payload: input.payload,
    attemptsMade: 0,
    maxAttempts: asJobMaxAttempts(input.maxAttempts),
    backoffMs: asBackoffMs(input.backoffMs),
    availableAt: now,
    createdAt: now,
    updatedAt: now,
  };

  state.jobsById.set(jobId, job);
  state.jobOrder.push(jobId);
  return job;
}

function toPublicJob(job: BridgeJobRecord): BridgeJobRecord {
  return {
    ...job,
    payload: { ...job.payload },
    result: job.result ? { ...job.result } : undefined,
  };
}

export function listBridgeJobs(status?: BridgeJobStatus): BridgeJobRecord[] {
  refreshExpiredLeases();

  const jobs = state.jobOrder
    .map((jobId) => state.jobsById.get(jobId))
    .filter((job): job is BridgeJobRecord => Boolean(job));

  return jobs
    .filter((job) => !status || job.status === status)
    .slice()
    .reverse()
    .map((job) => toPublicJob(job));
}

export function pollBridgeJob(input: {
  connectionToken: string;
  nodeId: string;
  leaseTtlSeconds?: number;
  machineId?: string;
  capabilities?: string[];
}): {
  node: BridgeNodeRecord;
  tokenId: string;
  expiresAt: string;
  job: BridgeJobRecord | null;
} {
  syncAuthStateFromDisk();
  const auth = getNodeByToken(input.connectionToken);

  if (auth.node.nodeId !== input.nodeId) {
    recordAuthDecision("mismatch", {
      nodeId: input.nodeId,
      tokenId: auth.tokenId,
      reason: "token_node_mismatch",
    });
    throw new ApiError(403, "FORBIDDEN", "Connection token is not valid for this node");
  }

  const now = nowIso();
  auth.node.status = "online";
  auth.node.lastSeenAt = now;
  auth.node.updatedAt = now;

  if (input.machineId) {
    auth.node.machineId = input.machineId;
  }
  if (input.capabilities) {
    auth.node.capabilities = input.capabilities;
  }
  state.nodes.set(auth.node.nodeId, auth.node);
  persistAuthStateToDisk();

  refreshExpiredLeases();

  const leaseTtlSeconds = asLeaseTtlSeconds(input.leaseTtlSeconds);
  const nowMs = Date.now();

  for (const jobId of state.jobOrder) {
    const job = state.jobsById.get(jobId);
    if (!job) continue;
    if (job.status !== "queued") continue;
    if (new Date(job.availableAt).getTime() > nowMs) continue;

    job.status = "leased";
    job.attemptsMade += 1;
    job.leasedByNodeId = input.nodeId;
    job.leaseId = fakeId("lease");
    job.leaseExpiresAt = new Date(nowMs + leaseTtlSeconds * 1000).toISOString();
    job.updatedAt = nowIso();

    return {
      node: auth.node,
      tokenId: auth.tokenId,
      expiresAt: auth.expiresAt,
      job: toPublicJob(job),
    };
  }

  return {
    node: auth.node,
    tokenId: auth.tokenId,
    expiresAt: auth.expiresAt,
    job: null,
  };
}

export function settleBridgeJob(input: {
  connectionToken: string;
  nodeId: string;
  jobId: string;
  leaseId: string;
  outcome: BridgeJobSettlementOutcome;
  result?: Record<string, unknown>;
  reason?: string;
  retryDelayMs?: number;
}): BridgeJobRecord {
  const auth = getNodeByToken(input.connectionToken);

  if (auth.node.nodeId !== input.nodeId) {
    recordAuthDecision("mismatch", {
      nodeId: input.nodeId,
      tokenId: auth.tokenId,
      reason: "token_node_mismatch",
    });
    throw new ApiError(403, "FORBIDDEN", "Connection token is not valid for this node");
  }

  refreshExpiredLeases();

  const job = requireJob(input.jobId);

  if (job.status !== "leased") {
    throw new ApiError(409, "JOB_NOT_LEASED", `Job '${job.jobId}' is not in leased status`);
  }

  if (job.leasedByNodeId !== input.nodeId) {
    throw new ApiError(403, "FORBIDDEN", `Job '${job.jobId}' is leased by another node`);
  }

  if (!job.leaseId || job.leaseId !== input.leaseId) {
    throw new ApiError(409, "LEASE_MISMATCH", "Lease id does not match current active lease");
  }

  const nowMs = Date.now();
  if (!job.leaseExpiresAt || new Date(job.leaseExpiresAt).getTime() <= nowMs) {
    throw new ApiError(409, "LEASE_EXPIRED", "Job lease already expired");
  }

  const updatedAt = nowIso();

  if (input.outcome === "ack") {
    job.status = "completed";
    job.result = input.result ?? { ok: true };
    job.failureReason = undefined;
    job.completedAt = updatedAt;
    clearLease(job);
    job.updatedAt = updatedAt;
    return toPublicJob(job);
  }

  if (input.outcome === "fail") {
    job.status = "failed";
    job.failureReason = input.reason?.trim() || "Connector marked job as failed";
    job.result = input.result;
    job.completedAt = updatedAt;
    clearLease(job);
    job.updatedAt = updatedAt;
    return toPublicJob(job);
  }

  const retryDelayMs = input.retryDelayMs === undefined ? job.backoffMs : asBackoffMs(input.retryDelayMs);

  if (job.attemptsMade >= job.maxAttempts) {
    job.status = "failed";
    job.failureReason = input.reason?.trim() || "Retry requested but max attempts exhausted";
    job.result = input.result;
    job.completedAt = updatedAt;
    clearLease(job);
    job.updatedAt = updatedAt;
    return toPublicJob(job);
  }

  job.status = "queued";
  job.availableAt = new Date(nowMs + retryDelayMs).toISOString();
  job.failureReason = input.reason?.trim();
  job.result = input.result;
  clearLease(job);
  job.updatedAt = updatedAt;

  return toPublicJob(job);
}

export function listNodeStatuses(): BridgeNodeRecord[] {
  syncAuthStateFromDisk();
  if (pruneTokenState()) {
    persistAuthStateToDisk();
  }
  const now = Date.now();
  const offlineThresholdMs = 90 * 1000;

  for (const node of state.nodes.values()) {
    const lastSeenMs = new Date(node.lastSeenAt).getTime();
    node.status = now - lastSeenMs > offlineThresholdMs ? "offline" : "online";
  }

  return Array.from(state.nodes.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function requireOnlineNodeForCapability(capability: string): BridgeNodeRecord {
  const normalized = capability.trim().toLowerCase();
  const onlineNodes = listNodeStatuses().filter((node) => node.status === "online");

  const matchingNode = onlineNodes.find((node) => {
    if (node.capabilities.length === 0) {
      return true;
    }

    return node.capabilities.some((item) => {
      const value = item.trim().toLowerCase();
      return value === normalized || value === "*";
    });
  });

  if (!matchingNode) {
    throw new ApiError(
      409,
      "BRIDGE_NODE_UNAVAILABLE",
      `No online Bridge node with '${normalized}' capability is currently available`
    );
  }

  return matchingNode;
}

export function getBridgeAuthConfig(): {
  bootstrapHeader: string;
  bootstrapKeyHint: string;
  adminHeader: string;
  adminKeyHint: string;
  heartbeatAuthHeader: string;
  authStateFile: string;
} {
  return {
    bootstrapHeader: "x-bridge-bootstrap-key",
    bootstrapKeyHint: "Set BRIDGE_BOOTSTRAP_KEY (default: bridge-bootstrap-dev)",
    adminHeader: "x-bridge-admin-key",
    adminKeyHint: "Set BRIDGE_ADMIN_KEY (default: bridge-admin-dev)",
    heartbeatAuthHeader: "Authorization: Bearer <connection-token>",
    authStateFile: AUTH_STATE_FILE,
  };
}

export function getBridgeAuthDecisionCounters(): BridgeAuthDecisionCounters {
  return { ...state.authDecisions };
}

export function getBridgeAuthDecisionHistory(limit = 8): BridgeAuthDecisionEvent[] {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 25) : 8;
  return state.authHistory.slice(-safeLimit).reverse().map((item) => ({ ...item }));
}
