import { apiError, jsonOk } from "@/lib/api/http";
import { listNodeStatuses } from "@/lib/bridge/runtime";
import { summarizeQueueHealth } from "@/lib/integrations/runtime";
import { assertRuntimeEnvContract } from "@/lib/runtime/env-contract";
import net from "node:net";

export const dynamic = "force-dynamic";

type ReadinessStatus = "online" | "offline" | "degraded";
type ContractStatus = "ok" | "degraded" | "failed";

interface RouteProbeResult {
  ok: boolean;
  status?: number;
  message: string;
}

function defaultRedisUrl(): string {
  return process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379/0";
}

function parseRedisTarget(redisUrl: string): { host: string; port: number; target: string } {
  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error(`Invalid REDIS_URL '${redisUrl}'`);
  }

  if (!parsed.hostname) {
    throw new Error(`REDIS_URL '${redisUrl}' is missing hostname`);
  }

  const port = parsed.port ? Number(parsed.port) : 6379;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`REDIS_URL '${redisUrl}' has invalid port`);
  }

  return {
    host: parsed.hostname,
    port,
    target: `${parsed.protocol}//${parsed.hostname}:${port}`,
  };
}

async function tcpReachable(host: string, port: number, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      cleanup();
      resolve();
    });

    socket.once("timeout", () => {
      cleanup();
      reject(new Error(`timeout after ${timeoutMs}ms`));
    });

    socket.once("error", (error) => {
      cleanup();
      reject(error);
    });

    socket.connect(port, host);
  });
}

function hasCapability(capabilities: string[], target: string): boolean {
  const normalized = target.trim().toLowerCase();
  return capabilities.some((capability) => {
    const value = capability.trim().toLowerCase();
    return value === "*" || value === normalized;
  });
}

async function probeRoute(
  url: string,
  init: RequestInit,
  timeoutMs = 2000,
  expectJson = true,
  reachableStatuses: number[] = [401, 403, 405, 400, 422, 200, 201, 204]
): Promise<RouteProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    const reachable = reachableStatuses.includes(response.status);

    if (reachable) {
      const contentType = response.headers.get("content-type") ?? "";
      if (expectJson && !contentType.toLowerCase().includes("application/json")) {
        return {
          ok: false,
          status: response.status,
          message: `unavailable (non-json content-type: ${contentType || "none"})`,
        };
      }

      return {
        ok: true,
        status: response.status,
        message: `reachable (HTTP ${response.status})`,
      };
    }

    return {
      ok: false,
      status: response.status,
      message: `unavailable (HTTP ${response.status})`,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "unavailable (request timeout)"
        : "unavailable (network error)";
    return { ok: false, message };
  } finally {
    clearTimeout(timeout);
  }
}

async function evaluateBridgeRoutes(origin: string): Promise<{
  status: ReadinessStatus;
  message: string;
}> {
  const [registerProbe, jobsProbe, pollProbe, preflightProbe] = await Promise.all([
    probeRoute(`${origin}/api/bridge/nodes/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ machineId: "readiness_probe" }),
    }, 2000, true),
    probeRoute(`${origin}/api/bridge/jobs`, {
      method: "GET",
    }, 2000, true),
    probeRoute(`${origin}/api/bridge/nodes/readiness-probe/poll`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer readiness_probe_invalid",
      },
      body: JSON.stringify({}),
    }, 2000, true),
    probeRoute(
      `${origin}/api/local-node/preflight`,
      {
        method: "GET",
      },
      2000,
      true,
      [200, 503]
    ),
  ]);

  const details = [
    `register=${registerProbe.message}`,
    `jobs=${jobsProbe.message}`,
    `poll=${pollProbe.message}`,
    `preflight=${preflightProbe.message}`,
  ];
  const unavailableCount =
    Number(!registerProbe.ok) + Number(!jobsProbe.ok) + Number(!pollProbe.ok) + Number(!preflightProbe.ok);

  if (unavailableCount === 0) {
    return {
      status: "online",
      message: `Bridge routes healthy: ${details.join(", ")}.`,
    };
  }

  if (unavailableCount === 1) {
    return {
      status: "degraded",
      message: `Bridge routes degraded: ${details.join(", ")}.`,
    };
  }

  return {
    status: "offline",
    message: `Bridge routes offline: ${details.join(", ")}.`,
  };
}

async function evaluateSupabase(supabaseUrl: string, supabaseAnon: string): Promise<{ status: ContractStatus; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(new URL("/rest/v1/", supabaseUrl), {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        apikey: supabaseAnon,
        Authorization: `Bearer ${supabaseAnon}`,
      },
    });

    const reachable =
      response.status === 200 ||
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404;

    return reachable
      ? { status: "ok", message: `Supabase reachable (HTTP ${response.status}).` }
      : { status: "failed", message: `Supabase unreachable (HTTP ${response.status}).` };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "timeout" : "network error";
    return { status: "failed", message: `Supabase unreachable (${reason}).` };
  } finally {
    clearTimeout(timeout);
  }
}

async function evaluateRedisBullmq(): Promise<{ status: ReadinessStatus; message: string }> {
  const redisUrl = defaultRedisUrl();

  try {
    const target = parseRedisTarget(redisUrl);
    await tcpReachable(target.host, target.port, 1500);
    return {
      status: "online",
      message: `Redis/BullMQ reachable at ${target.target}.`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return {
      status: "degraded",
      message:
        `Redis/BullMQ unavailable (${reason}). Start Redis, verify REDIS_URL, then refresh readiness.`,
    };
  }
}

export async function GET(request: Request) {
  try {
    const runtimeEnv = assertRuntimeEnvContract("readiness");
    const checkedAt = new Date().toISOString();
    const origin = new URL(request.url).origin;
    const nodes = listNodeStatuses();
    const onlineNodes = nodes.filter((node) => node.status === "online");
    const queue = summarizeQueueHealth();
    const bridgeRoutes = await evaluateBridgeRoutes(origin);
    const supabase = await evaluateSupabase(runtimeEnv.supabaseUrl, runtimeEnv.supabaseAnonKey);
    const redisBullmq = await evaluateRedisBullmq();

    const bridgeOnline = onlineNodes.length > 0;
    const hasComfyUI = bridgeOnline && onlineNodes.some((node) => hasCapability(node.capabilities, "comfyui"));
    const hasOllama = bridgeOnline && onlineNodes.some((node) => hasCapability(node.capabilities, "ollama"));

    const dependencies = [
      {
        key: "app_runtime",
        label: "App Runtime",
        status: "online" as ReadinessStatus,
        critical: true,
        message: "Runtime is responding."
      },
      {
        key: "bridge_routes",
        label: "Bridge API Routes",
        status: bridgeRoutes.status,
        critical: true,
        message: bridgeRoutes.message
      },
      {
        key: "bridge_node",
        label: "Bridge Node",
        status: bridgeOnline ? ("online" as ReadinessStatus) : ("offline" as ReadinessStatus),
        critical: true,
        message: bridgeOnline
          ? `${onlineNodes.length} bridge node(s) online.`
          : "No online bridge node. Start connector bridge node and refresh readiness."
      },
      {
        key: "comfyui",
        label: "ComfyUI",
        status: hasComfyUI ? ("online" as ReadinessStatus) : ("offline" as ReadinessStatus),
        critical: true,
        message: hasComfyUI
          ? "ComfyUI capability is available."
          : "ComfyUI capability is missing. Re-register node with comfyui capability."
      },
      {
        key: "ollama",
        label: "Ollama",
        status: hasOllama ? ("online" as ReadinessStatus) : ("offline" as ReadinessStatus),
        critical: true,
        message: hasOllama
          ? "Ollama capability is available."
          : "Ollama capability is missing. Re-register node with ollama capability."
      },
      {
        key: "redis_bullmq",
        label: "Redis / BullMQ",
        status: redisBullmq.status,
        critical: true,
        message: redisBullmq.message
      },
      {
        key: "queue",
        label: "Queue",
        status:
          redisBullmq.status !== "online"
            ? ("degraded" as ReadinessStatus)
            : queue.failedJobs > 0
              ? ("degraded" as ReadinessStatus)
              : ("online" as ReadinessStatus),
        critical: true,
        message:
          redisBullmq.status !== "online"
            ? "Queue health is degraded because Redis/BullMQ is unavailable. Recover Redis first, then re-check queue."
            : queue.failedJobs > 0
            ? `${queue.failedJobs} failed job(s) detected. Clear failed queue jobs before reliability run.`
            : queue.totalJobs > 0
              ? `Queue healthy: ${queue.pendingJobs} pending, ${queue.activeJobs} active, ${queue.completedJobs} completed.`
              : "Queue healthy. No jobs recorded yet."
      }
    ];

    const overallStatus: ReadinessStatus = dependencies.some((dependency) => dependency.status === "offline")
      ? "offline"
      : dependencies.some((dependency) => dependency.status === "degraded")
        ? "degraded"
        : "online";

    const bridgeContractStatus: ContractStatus =
      bridgeRoutes.status === "offline" || !bridgeOnline
        ? "failed"
        : bridgeRoutes.status === "degraded" || !hasComfyUI || !hasOllama
          ? "degraded"
          : "ok";

    const queueContractStatus: ContractStatus = redisBullmq.status !== "online" || queue.failedJobs > 0 ? "degraded" : "ok";

    const contractV2Dependencies = {
      supabase: {
        status: supabase.status,
        message: `${supabase.message} (urlSource=${runtimeEnv.sources.supabaseUrl}, anonKeySource=${runtimeEnv.sources.supabaseAnonKey}, serviceRoleSource=${runtimeEnv.sources.supabaseServiceRoleKey})`,
      },
      queue: {
        status: queueContractStatus,
        message:
          redisBullmq.status !== "online"
            ? "Queue degraded: Redis/BullMQ unavailable."
            : queue.failedJobs > 0
            ? `${queue.failedJobs} failed job(s) detected.`
            : `Queue healthy: pending=${queue.pendingJobs}, active=${queue.activeJobs}, completed=${queue.completedJobs}.`,
      },
      redis: {
        status: redisBullmq.status === "online" ? "ok" : "degraded",
        message: redisBullmq.message,
      },
      bridge: {
        status: bridgeContractStatus,
        message: bridgeRoutes.message,
      },
    } as const;

    const contractV2Status: ContractStatus =
      Object.values(contractV2Dependencies).some((dep) => dep.status === "failed")
        ? "failed"
        : Object.values(contractV2Dependencies).some((dep) => dep.status === "degraded")
          ? "degraded"
          : "ok";

    return jsonOk({
      checkedAt,
      overallStatus,
      dependencies,
      contract_v2: {
        status: contractV2Status,
        dependencies: contractV2Dependencies,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
