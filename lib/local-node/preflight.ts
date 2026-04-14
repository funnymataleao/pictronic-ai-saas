import net from "node:net";

export type PreflightStatus = "ok" | "failed" | "skipped";

export type PreflightCheckName = "next_runtime" | "redis_bullmq" | "comfyui" | "ollama";

export interface PreflightCheck {
  name: PreflightCheckName;
  target: string;
  required: boolean;
  status: PreflightStatus;
  latencyMs: number;
  observedAt: string;
  details?: string;
  error?: string;
}

export interface PreflightReport {
  preflight: "ok" | "failed";
  checkedAt: string;
  runtime: {
    nodeVersion: string;
    pid: number;
    uptimeSec: number;
  };
  summary: {
    total: number;
    ok: number;
    failed: number;
    skipped: number;
  };
  checks: PreflightCheck[];
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultRedisUrl(): string {
  return process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379/0";
}

function defaultComfyUrl(): string {
  return process.env.COMFYUI_URL?.trim() || "http://127.0.0.1:8188";
}

function defaultOllamaUrl(): string {
  return process.env.OLLAMA_URL?.trim() || "http://127.0.0.1:11434";
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

async function checkHttpJson(params: {
  name: PreflightCheckName;
  baseUrl: string;
  path: string;
  required: boolean;
  timeoutMs?: number;
}): Promise<PreflightCheck> {
  const { name, baseUrl, path, required, timeoutMs = 2500 } = params;
  const observedAt = nowIso();

  if (!required) {
    return {
      name,
      target: `${baseUrl}${path}`,
      required,
      status: "skipped",
      latencyMs: 0,
      observedAt,
      details: "check disabled via env flag",
    };
  }

  const started = Date.now();
  let target = `${baseUrl}${path}`;

  try {
    const url = new URL(path, baseUrl);
    target = url.toString();
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });

    const latencyMs = Date.now() - started;

    if (!response.ok) {
      return {
        name,
        target,
        required,
        status: "failed",
        latencyMs,
        observedAt,
        error: `HTTP ${response.status}`,
      };
    }

    return {
      name,
      target,
      required,
      status: "ok",
      latencyMs,
      observedAt,
      details: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      name,
      target,
      required,
      status: "failed",
      latencyMs: Date.now() - started,
      observedAt,
      error: formatError(error),
    };
  }
}

async function checkRedisBullmq(params: { required: boolean; timeoutMs?: number }): Promise<PreflightCheck> {
  const { required, timeoutMs = 1500 } = params;
  const observedAt = nowIso();
  const redisUrl = defaultRedisUrl();

  if (!required) {
    return {
      name: "redis_bullmq",
      target: redisUrl,
      required,
      status: "skipped",
      latencyMs: 0,
      observedAt,
      details: "check disabled via env flag",
    };
  }

  const started = Date.now();

  try {
    const target = parseRedisTarget(redisUrl);
    await tcpReachable(target.host, target.port, timeoutMs);
    return {
      name: "redis_bullmq",
      target: target.target,
      required,
      status: "ok",
      latencyMs: Date.now() - started,
      observedAt,
      details: "TCP connect successful",
    };
  } catch (error) {
    return {
      name: "redis_bullmq",
      target: redisUrl,
      required,
      status: "failed",
      latencyMs: Date.now() - started,
      observedAt,
      error: formatError(error),
    };
  }
}

function checkNextRuntime(): PreflightCheck {
  return {
    name: "next_runtime",
    target: "internal://next-runtime",
    required: true,
    status: "ok",
    latencyMs: 0,
    observedAt: nowIso(),
    details: `pid=${process.pid}`,
  };
}

function summarize(checks: PreflightCheck[]): PreflightReport["summary"] {
  return checks.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.status] += 1;
      return acc;
    },
    { total: 0, ok: 0, failed: 0, skipped: 0 }
  );
}

export async function runLocalPreflight(): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];
  checks.push(checkNextRuntime());

  const [redis, comfy, ollama] = await Promise.all([
    checkRedisBullmq({ required: toBool(process.env.PREFLIGHT_REQUIRE_REDIS_BULLMQ, true) }),
    checkHttpJson({
      name: "comfyui",
      baseUrl: defaultComfyUrl(),
      path: "/system_stats",
      required: toBool(process.env.PREFLIGHT_REQUIRE_COMFYUI, true),
    }),
    checkHttpJson({
      name: "ollama",
      baseUrl: defaultOllamaUrl(),
      path: "/api/tags",
      required: toBool(process.env.PREFLIGHT_REQUIRE_OLLAMA, true),
    }),
  ]);

  checks.push(redis, comfy, ollama);

  const summary = summarize(checks);
  const hasRequiredFailures = checks.some((item) => item.required && item.status === "failed");

  return {
    preflight: hasRequiredFailures ? "failed" : "ok",
    checkedAt: nowIso(),
    runtime: {
      nodeVersion: process.version,
      pid: process.pid,
      uptimeSec: Math.floor(process.uptime()),
    },
    summary,
    checks,
  };
}
