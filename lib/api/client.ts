import type {
  ApiErrorPayload,
  Asset,
  AssetListPayload,
  CreateProjectRequest,
  GenerateRequest,
  IdempotencyActivity,
  LocalNode,
  LocalNodeStatusPayload,
  LocalNodeTokenPayload,
  Project,
  RuntimeReadinessPayload,
  UpdateMetadataRequest,
  UploadItem
} from "@/lib/api/contracts";
import {
  parseApiErrorEnvelope,
  parseAssetListPage,
  parseProject,
  parseProjectList,
  parseRuntimeReadiness,
  parseUploadList
} from "@/lib/api/guards";

const API_BASE_URL = process.env.NEXT_PUBLIC_PIC_API_BASE_URL ?? "";
const ENABLE_MOCK = (process.env.NEXT_PUBLIC_PIC_MOCK ?? "true").toLowerCase() === "true";
const FETCH_TIMEOUT_MS = 8000;

class ApiError extends Error {
  code: string;
  details?: unknown;
  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.code = payload.code;
    this.details = payload.details;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function resolveApiBaseUrl(): string {
  const configuredBase = normalizeBaseUrl(API_BASE_URL);
  if (!configuredBase) return "";
  if (typeof window === "undefined") return configuredBase;

  try {
    const configured = new URL(configuredBase);
    const page = window.location;
    const sameProtocol = configured.protocol === page.protocol;
    const bothLoopback = isLoopbackHost(configured.hostname) && isLoopbackHost(page.hostname);
    if (sameProtocol && bothLoopback) {
      // Browser frontend must use same-origin API route paths to avoid localhost split/CORS traps.
      return "";
    }
  } catch {
    return configuredBase;
  }

  return configuredBase;
}

let mockProjects: Project[] = [
  {
    id: "family-lifestyle",
    name: "Family Lifestyle",
    imagesCount: 18,
    approvedCount: 4,
    thumbnailUrls: ["a", "b", "c", "d"],
    createdAt: new Date().toISOString()
  },
  {
    id: "minimalist-interior",
    name: "Minimalist Interior",
    imagesCount: 24,
    approvedCount: 7,
    thumbnailUrls: ["a", "b", "c", "d"],
    createdAt: new Date().toISOString()
  }
];

let mockAssets: Asset[] = [
  {
    id: "asset-1",
    projectId: "family-lifestyle",
    thumbnailUrl: "",
    originalUrl: "",
    prompt: "sunny home kitchen scene",
    provider: "cloud",
    model: "flux-dev",
    status: "ready",
    metadataStatus: "ok",
    title: "Happy family preparing breakfast",
    tags: ["family", "kitchen", "breakfast", "lifestyle"],
    createdAt: new Date().toISOString()
  },
  {
    id: "asset-2",
    projectId: "family-lifestyle",
    thumbnailUrl: "",
    originalUrl: "",
    prompt: "candid evening scene",
    provider: "cloud",
    model: "flux-dev",
    status: "failed",
    metadataStatus: "timeout",
    title: "",
    tags: [],
    error: "Metadata worker timeout after 30s",
    createdAt: new Date().toISOString()
  }
];

let mockUploads: UploadItem[] = [];
let mockLocalNode: LocalNode | null = null;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const isUploadEnqueueRoute = path.includes("/api/uploads/adobe");
  const resolvedBaseUrl = resolveApiBaseUrl();
  const requestUrl = `${resolvedBaseUrl}${path}`;

  try {
    const headers = new Headers(init?.headers ?? {});
    const method = (init?.method ?? "GET").toUpperCase();
    const hasBody = init?.body !== undefined && init?.body !== null;
    if (hasBody && method !== "GET" && method !== "HEAD" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(requestUrl, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store"
    });

    const contentType = response.headers.get("content-type") ?? "";
    const isJsonResponse = contentType.toLowerCase().includes("application/json");
    const isBridgePollRoute = path.includes("/api/bridge/nodes/") && path.includes("/poll");

    if (!response.ok) {
      const looksLikeHtml = contentType.includes("text/html");
      const fallback: ApiErrorPayload = {
        message: `HTTP ${response.status}`,
        code: `http_${response.status}`
      };

      if (isUploadEnqueueRoute && (response.status >= 500 || looksLikeHtml)) {
        throw new ApiError({
          message:
            "Enqueue route is unavailable right now. Retry, refresh runtime readiness, or check bridge route operations.",
          code: "route_unavailable",
          details: `route=${requestUrl} status=${response.status} contentType=${contentType || "unknown"}`
        });
      }

      if (isBridgePollRoute && !isJsonResponse) {
        throw new ApiError({
          message:
            "Poll contract breach: non-JSON fallback response detected. Verify connector BACKEND_URL and poll route runtime, then refresh readiness.",
          code: "poll_contract_breach",
          details: `route=${requestUrl} status=${response.status} contentType=${contentType || "unknown"}`
        });
      }

      const rawBody = isJsonResponse ? await response.json().catch(() => null) : null;
      const parsedEnvelopeError = rawBody ? parseApiErrorEnvelope(rawBody) : null;
      const body: ApiErrorPayload =
        parsedEnvelopeError ??
        (isJsonResponse && rawBody && typeof rawBody === "object"
          ? ({
              message:
                typeof (rawBody as { message?: unknown }).message === "string"
                  ? ((rawBody as { message: string }).message)
                  : fallback.message,
              code:
                typeof (rawBody as { code?: unknown }).code === "string"
                  ? ((rawBody as { code: string }).code)
                  : fallback.code,
              details: (rawBody as { details?: unknown }).details
            } satisfies ApiErrorPayload)
          : fallback);

      if (isUploadEnqueueRoute && response.status >= 500) {
        throw new ApiError({
          message:
            "Enqueue route failed at runtime. Retry, refresh runtime readiness, or check bridge route operations.",
          code: "route_unavailable",
          details: `route=${requestUrl} status=${response.status} apiCode=${body.code ?? "unknown"}`
        });
      }
      throw new ApiError(body);
    }

    if (!isJsonResponse) {
      const message = isBridgePollRoute
        ? "Poll contract breach: non-JSON fallback response detected. Verify connector BACKEND_URL and poll route runtime, then refresh readiness."
        : "Contract breach: expected JSON response from API route.";

      throw new ApiError({
        message,
        code: isBridgePollRoute ? "poll_contract_breach" : "contract_breach",
        details: `route=${requestUrl} status=${response.status} contentType=${contentType || "unknown"}`
      });
    }

    const parsed = await response.json().catch(() => {
      throw new ApiError({
        message: "Contract breach: response body is not valid JSON.",
        code: "contract_breach",
        details: `route=${requestUrl} status=${response.status}`
      });
    });

    return parsed as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError({
        message: `Request timeout: ${requestUrl}`,
        code: "timeout",
        details: `baseUrl=${resolvedBaseUrl || "<same-origin>"}`
      });
    }
    const reason = error instanceof Error ? error.message : "unknown fetch failure";
    throw new ApiError({
      message: `Network error for ${requestUrl}. If app is opened on localhost, use same-host API base URL or leave NEXT_PUBLIC_PIC_API_BASE_URL empty for same-origin.`,
      code: "network_error",
      details: `baseUrl=${resolvedBaseUrl || "<same-origin>"} reason=${reason}`
    });
  } finally {
    clearTimeout(timeout);
  }
}

const remoteApi = {
  async listProjects(): Promise<Project[]> {
    const payload = await fetchJson<unknown>("/api/projects");
    return parseProjectList(payload);
  },
  async createProject(body: CreateProjectRequest): Promise<Project> {
    const payload = await fetchJson<unknown>("/api/projects", {
      method: "POST",
      body: JSON.stringify(body)
    });
    return parseProject(payload);
  },
  async listAssets(projectId: string): Promise<Asset[]> {
    const page = await this.listAssetsPage(projectId);
    return page.items;
  },
  async listAssetsPage(projectId: string, options?: { status?: string; cursor?: string }): Promise<AssetListPayload> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.cursor) params.set("cursor", options.cursor);
    const query = params.toString();
    const payload = await fetchJson<unknown>(
      `/api/projects/${projectId}/assets${query ? `?${query}` : ""}`
    );
    return parseAssetListPage(payload);
  },
  async generate(projectId: string, body: GenerateRequest): Promise<IdempotencyActivity> {
    const key = createIdempotencyKey("gen");
    const payload = await fetchJson<{ data?: { idempotencyKey?: string; duplicate?: boolean; acceptedAt?: string } }>(
      `/api/projects/${projectId}/generate`,
      {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body)
    });
    return {
      scope: "generate",
      key: payload.data?.idempotencyKey ?? key,
      duplicate: Boolean(payload.data?.duplicate),
      acceptedAt: payload.data?.acceptedAt ?? nowIso()
    };
  },
  async approveAsset(assetId: string, projectId: string): Promise<IdempotencyActivity> {
    const key = createIdempotencyKey("approve");
    const payload = await fetchJson<{ data?: { idempotencyKey?: string; duplicate?: boolean; approvedAt?: string } }>(
      `/api/assets/${assetId}/approve`,
      {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ projectId })
    });
    return {
      scope: "approve",
      key: payload.data?.idempotencyKey ?? key,
      duplicate: Boolean(payload.data?.duplicate),
      acceptedAt: payload.data?.approvedAt ?? nowIso()
    };
  },
  async regenerateMetadata(assetId: string): Promise<IdempotencyActivity> {
    const key = createIdempotencyKey("meta");
    await fetchJson(`/api/assets/${assetId}/metadata/regenerate`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ mode: "both" })
    });
    return {
      scope: "metadata",
      key,
      duplicate: false,
      acceptedAt: nowIso()
    };
  },
  async updateMetadata(assetId: string, body: UpdateMetadataRequest): Promise<void> {
    await fetchJson(`/api/assets/${assetId}/metadata`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  },
  async listUploads(projectId: string): Promise<UploadItem[]> {
    const payload = await fetchJson<unknown>(`/api/uploads?projectId=${projectId}`);
    return parseUploadList(payload);
  },
  async startUpload(assetIds: string[], projectId: string): Promise<IdempotencyActivity> {
    const key = createIdempotencyKey("upl");
    const payload = await fetchJson<{ data?: { idempotencyKey?: string; duplicate?: boolean; acceptedAt?: string } }>(
      `/api/uploads/adobe`,
      {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ assetIds, projectId })
    });
    return {
      scope: "upload",
      key: payload.data?.idempotencyKey ?? key,
      duplicate: Boolean(payload.data?.duplicate),
      acceptedAt: payload.data?.acceptedAt ?? nowIso()
    };
  },
  async getLocalNodeStatus(): Promise<LocalNodeStatusPayload> {
    const payload = await fetchJson<{ data?: LocalNodeStatusPayload }>("/api/local-node/status");
    if (!payload?.data || !Array.isArray(payload.data.items)) {
      throw new ApiError({ message: "Invalid local node status response", code: "contract_error" });
    }
    return payload.data;
  },
  async generateLocalNodeToken(nodeId?: string): Promise<LocalNodeTokenPayload> {
    const payload = await fetchJson<{ data?: LocalNodeTokenPayload }>("/api/local-node/connection-token", {
      method: "POST",
      body: JSON.stringify(nodeId ? { nodeId } : {})
    });
    if (!payload?.data?.node || !payload.data.connectionToken?.token) {
      throw new ApiError({ message: "Invalid local node token response", code: "contract_error" });
    }
    return payload.data;
  },
  async getRuntimeReadiness(): Promise<RuntimeReadinessPayload> {
    const payload = await fetchJson<unknown>("/api/runtime/readiness");
    return parseRuntimeReadiness(payload);
  }
};

const mockApi = {
  async listProjects() {
    await delay(220);
    return [...mockProjects];
  },
  async createProject(body: CreateProjectRequest) {
    await delay(180);
    const project: Project = {
      id: body.name.toLowerCase().replace(/\s+/g, "-") + `-${Date.now().toString().slice(-4)}`,
      name: body.name,
      imagesCount: 0,
      approvedCount: 0,
      thumbnailUrls: ["a", "b", "c", "d"],
      createdAt: new Date().toISOString()
    };
    mockProjects = [project, ...mockProjects];
    return project;
  },
  async listAssets(projectId: string) {
    await delay(220);
    const page = await this.listAssetsPage(projectId);
    return page.items;
  },
  async listAssetsPage(projectId: string, options?: { status?: string; cursor?: string }): Promise<AssetListPayload> {
    await delay(220);
    const filtered = mockAssets
      .filter((asset) => asset.projectId === projectId)
      .filter((asset) => (options?.status ? asset.status === options.status : true));
    const pageSize = 20;
    const start = options?.cursor ? Number.parseInt(options.cursor, 10) : 0;
    const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;
    const items = filtered.slice(safeStart, safeStart + pageSize);
    const nextCursor = safeStart + pageSize < filtered.length ? String(safeStart + pageSize) : null;

    return {
      projectId,
      sort: "created_at_desc,id_desc",
      items,
      nextCursor,
    };
  },
  async generate(projectId: string, body: GenerateRequest): Promise<IdempotencyActivity> {
    await delay(350);
    const key = createIdempotencyKey("gen");
    const now = new Date().toISOString();
    for (let i = 0; i < body.batch; i += 1) {
      mockAssets.unshift({
        id: `asset-${Date.now()}-${i}`,
        projectId,
        thumbnailUrl: "",
        originalUrl: "",
        prompt: body.prompt,
        provider: body.provider,
        model: body.model,
        status: i % 7 === 0 ? "failed" : "ready",
        metadataStatus: i % 7 === 0 ? "timeout" : "ok",
        title: i % 7 === 0 ? "" : `Generated stock asset ${i + 1}`,
        tags: i % 7 === 0 ? [] : ["stock", "ai", "generated"],
        error: i % 7 === 0 ? "Generation timeout at provider" : undefined,
        createdAt: now
      });
    }
    return {
      scope: "generate",
      key,
      duplicate: false,
      acceptedAt: now
    };
  },
  async approveAsset(assetId: string, _projectId: string): Promise<IdempotencyActivity> {
    await delay(120);
    const now = new Date().toISOString();
    const key = createIdempotencyKey("approve");
    mockAssets = mockAssets.map((asset) =>
      asset.id === assetId ? { ...asset, status: "approved" } : asset
    );
    return {
      scope: "approve",
      key,
      duplicate: false,
      acceptedAt: now
    };
  },
  async regenerateMetadata(assetId: string): Promise<IdempotencyActivity> {
    await delay(170);
    const now = new Date().toISOString();
    const key = createIdempotencyKey("meta");
    mockAssets = mockAssets.map((asset) =>
      asset.id === assetId
        ? {
            ...asset,
            metadataStatus: "ok",
            status: "ready",
            title: "Recovered metadata title",
            tags: ["recovered", "metadata", "stock"],
            error: undefined
          }
        : asset
    );
    return {
      scope: "metadata",
      key,
      duplicate: false,
      acceptedAt: now
    };
  },
  async updateMetadata(assetId: string, body: UpdateMetadataRequest) {
    await delay(160);
    mockAssets = mockAssets.map((asset) =>
      asset.id === assetId
        ? {
            ...asset,
            title: body.title,
            tags: body.tags,
            metadataStatus: "ok",
            error: undefined
          }
        : asset
    );
  },
  async listUploads(projectId: string) {
    await delay(150);
    return mockUploads.filter((upload) => upload.projectId === projectId);
  },
  async startUpload(assetIds: string[], _projectId: string): Promise<IdempotencyActivity> {
    await delay(220);
    const key = createIdempotencyKey("upl");
    const now = new Date().toISOString();

    for (const assetId of assetIds) {
      const failed = assetId.endsWith("7");
      mockUploads.unshift({
        id: `upload-${Date.now()}-${assetId}`,
        projectId: mockAssets.find((asset) => asset.id === assetId)?.projectId ?? "unknown",
        assetId,
        status: failed ? "failed" : "uploaded",
        error: failed ? "Adobe FTP auth rejected, retry needed" : undefined,
        createdAt: now,
        updatedAt: now
      });

      mockAssets = mockAssets.map((asset) =>
        asset.id === assetId ? { ...asset, status: failed ? "failed" : "uploaded" } : asset
      );
    }
    return {
      scope: "upload",
      key,
      duplicate: false,
      acceptedAt: now
    };
  },
  async getLocalNodeStatus(): Promise<LocalNodeStatusPayload> {
    await delay(120);
    return {
      items: mockLocalNode ? [mockLocalNode] : [],
      checkedAt: new Date().toISOString()
    };
  },
  async generateLocalNodeToken(nodeId?: string): Promise<LocalNodeTokenPayload> {
    await delay(220);
    const now = new Date().toISOString();
    const resolvedNodeId = nodeId ?? mockLocalNode?.nodeId ?? `node-${Date.now().toString().slice(-6)}`;
    mockLocalNode = {
      nodeId: resolvedNodeId,
      machineId: "pictronic-local-node",
      capabilities: ["comfyui", "ollama"],
      status: "online",
      registeredAt: mockLocalNode?.registeredAt ?? now,
      lastSeenAt: now,
      updatedAt: now
    };

    return {
      mode: mockLocalNode?.registeredAt === now ? "registered" : "rotated",
      node: mockLocalNode,
      connectionToken: {
        token: `pct_bridge_demo_${Math.random().toString(36).slice(2, 12)}`,
        tokenId: `ctk_${Math.random().toString(36).slice(2, 8)}`,
        issuedAt: now,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      },
      issuedAt: now
    };
  },
  async getRuntimeReadiness(): Promise<RuntimeReadinessPayload> {
    await delay(120);
    const bridgeOnline = Boolean(mockLocalNode?.status === "online");
    const capabilities = new Set((mockLocalNode?.capabilities ?? []).map((capability) => capability.toLowerCase()));
    const hasComfy = bridgeOnline && (capabilities.has("*") || capabilities.has("comfyui"));
    const hasOllama = bridgeOnline && (capabilities.has("*") || capabilities.has("ollama"));
    const redisOnline = false;
    const failedUploads = mockUploads.filter((upload) => upload.status === "failed").length;
    const totalUploads = mockUploads.length;

    const dependencies: RuntimeReadinessPayload["dependencies"] = [
      {
        key: "app_runtime",
        label: "App Runtime",
        status: "online",
        critical: true,
        message: "UI/API runtime is responding."
      },
      {
        key: "bridge_routes",
        label: "Bridge API Routes",
        status: "online",
        critical: true,
        message: "Bridge routes healthy in mock mode."
      },
      {
        key: "bridge_node",
        label: "Bridge Node",
        status: bridgeOnline ? "online" : "offline",
        critical: true,
        message: bridgeOnline
          ? "Bridge node heartbeat is healthy."
          : "No online bridge node. Start connector bridge node and refresh readiness."
      },
      {
        key: "comfyui",
        label: "ComfyUI",
        status: hasComfy ? "online" : "offline",
        critical: true,
        message: hasComfy
          ? "ComfyUI capability is available."
          : "ComfyUI capability is missing. Re-register node with comfyui capability."
      },
      {
        key: "ollama",
        label: "Ollama",
        status: hasOllama ? "online" : "offline",
        critical: true,
        message: hasOllama
          ? "Ollama capability is available."
          : "Ollama capability is missing. Re-register node with ollama capability."
      },
      {
        key: "redis_bullmq",
        label: "Redis / BullMQ",
        status: redisOnline ? "online" : "degraded",
        critical: true,
        message: redisOnline
          ? "Redis/BullMQ reachable."
          : "Redis/BullMQ unavailable in mock mode. Start Redis before reliability run."
      },
      {
        key: "queue",
        label: "Queue",
        status: !redisOnline || failedUploads > 0 ? "degraded" : "online",
        critical: true,
        message:
          !redisOnline
            ? "Queue degraded: Redis/BullMQ unavailable."
            : failedUploads > 0
            ? `${failedUploads} failed upload job(s) detected. Clear failed jobs before reliability run.`
            : totalUploads > 0
              ? `Queue healthy. ${totalUploads} upload job(s) recorded without active failures.`
              : "Queue healthy. No failed jobs detected."
      }
    ];

    const overallStatus = dependencies.some((dependency) => dependency.status === "offline")
      ? "offline"
      : dependencies.some((dependency) => dependency.status === "degraded")
        ? "degraded"
        : "online";

    return {
      checkedAt: nowIso(),
      overallStatus,
      dependencies
    };
  }
};

export const api = ENABLE_MOCK ? mockApi : remoteApi;
export { ApiError };
