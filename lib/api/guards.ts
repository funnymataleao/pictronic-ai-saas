import type {
  ApiErrorPayload,
  Asset,
  AssetListPayload,
  AssetStatus,
  MetadataStatus,
  Project,
  ProjectListPayload,
  RuntimeReadinessDependency,
  RuntimeReadinessPayload,
  RuntimeDependencyStatus,
  UploadItem,
  UploadListPayload,
  UploadStatus,
} from "@/lib/api/contracts";

const assetStatuses: AssetStatus[] = [
  "generating",
  "processing",
  "ready",
  "approved",
  "uploading",
  "uploaded",
  "failed"
];

const metadataStatuses: MetadataStatus[] = ["ok", "failed", "timeout", "pending"];
const uploadStatuses: UploadStatus[] = ["queued", "uploading", "uploaded", "failed"];
const readinessStatuses: RuntimeDependencyStatus[] = ["online", "offline", "degraded"];

const fallbackAssetStatus: AssetStatus = "processing";
const fallbackMetadataStatus: MetadataStatus = "pending";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readString(value: unknown, fallback: string, issues: string[], field: string): string {
  if (typeof value === "string") return value;
  issues.push(field);
  return fallback;
}

function normalizeAssetStatus(input: unknown, issues: string[]): AssetStatus {
  if (typeof input !== "string") {
    issues.push("status");
    return fallbackAssetStatus;
  }

  const normalized = input.toLowerCase();
  if (assetStatuses.includes(normalized as AssetStatus)) return normalized as AssetStatus;

  if (normalized === "completed") return "ready";
  if (normalized === "active") return "processing";
  if (normalized === "error") return "failed";

  issues.push("status");
  return fallbackAssetStatus;
}

function normalizeMetadataStatus(input: unknown, issues: string[]): MetadataStatus {
  if (typeof input !== "string") {
    issues.push("metadataStatus");
    return fallbackMetadataStatus;
  }

  const normalized = input.toLowerCase();
  if (metadataStatuses.includes(normalized as MetadataStatus)) return normalized as MetadataStatus;
  if (normalized === "completed") return "ok";
  if (normalized === "active") return "pending";

  issues.push("metadataStatus");
  return fallbackMetadataStatus;
}

function unwrapData(input: unknown): unknown {
  if (!isObject(input)) return input;
  if (typeof input.ok === "boolean" && "data" in input) {
    return input.data;
  }
  return input;
}

function parseCollectionItems(input: unknown, errorMessage: string): unknown[] {
  const data = unwrapData(input);
  if (Array.isArray(data)) return data;
  if (isObject(data) && Array.isArray(data.items)) return data.items;
  throw new Error(errorMessage);
}

function parseNextCursor(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "string") return input;
  throw new Error("Invalid response cursor");
}

export function parseApiErrorEnvelope(input: unknown): ApiErrorPayload | null {
  if (!isObject(input) || input.ok !== false || !isObject(input.error)) {
    return null;
  }

  const raw = input.error;
  if (typeof raw.code !== "string" || typeof raw.message !== "string") {
    return null;
  }

  return {
    code: raw.code,
    message: raw.message,
    details: "details" in raw ? raw.details : undefined,
  };
}

export function parseProject(input: unknown): Project {
  if (!isObject(input)) throw new Error("Invalid project payload");
  if (typeof input.id !== "string") throw new Error("Invalid project.id");
  if (typeof input.name !== "string") throw new Error("Invalid project.name");

  return {
    id: input.id,
    name: input.name,
    imagesCount: typeof input.imagesCount === "number" ? input.imagesCount : 0,
    approvedCount: typeof input.approvedCount === "number" ? input.approvedCount : 0,
    thumbnailUrls: isStringArray(input.thumbnailUrls) ? input.thumbnailUrls : [],
    createdAt: typeof input.createdAt === "string" ? input.createdAt : new Date().toISOString()
  };
}

export function parseAsset(input: unknown, fallbackId = `asset-fallback-${Date.now()}`): Asset {
  if (!isObject(input)) {
    return {
      id: fallbackId,
      projectId: "unknown",
      thumbnailUrl: "",
      originalUrl: "",
      prompt: "Contract mismatch payload",
      provider: "unknown",
      model: "unknown",
      status: fallbackAssetStatus,
      metadataStatus: fallbackMetadataStatus,
      title: "Unavailable asset data",
      tags: [],
      error: "Contract mismatch fallback: payload is not an object",
      createdAt: new Date().toISOString()
    };
  }

  const issues: string[] = [];
  const metadata = isObject(input.metadata) ? input.metadata : null;
  const normalizedStatus = normalizeAssetStatus(input.status, issues);
  const normalizedMetadataStatus = normalizeMetadataStatus(
    input.metadataStatus ?? input.metadata_status,
    issues
  );

  const titleCandidate = typeof input.title === "string" ? input.title : metadata?.title;
  const tagsCandidate = Array.isArray(input.tags) ? input.tags : metadata?.tags;
  const tags = isStringArray(tagsCandidate) ? tagsCandidate : [];
  if (!isStringArray(tagsCandidate ?? [])) {
    issues.push("tags");
  }

  const upstreamError = typeof input.error === "string" ? input.error : null;

  const asset: Asset = {
    id: readString(input.id, fallbackId, issues, "id"),
    projectId: readString(input.projectId, "unknown", issues, "projectId"),
    thumbnailUrl: readString(input.thumbnailUrl, "", issues, "thumbnailUrl"),
    originalUrl: readString(input.originalUrl, "", issues, "originalUrl"),
    prompt: readString(input.prompt, "", issues, "prompt"),
    provider: readString(input.provider, "unknown", issues, "provider"),
    model: readString(input.model, "unknown", issues, "model"),
    status: normalizedStatus,
    metadataStatus: normalizedMetadataStatus,
    title: readString(titleCandidate, "", issues, "title"),
    tags,
    error: upstreamError ?? undefined,
    createdAt: readString(input.createdAt, new Date().toISOString(), issues, "createdAt")
  };

  const contractMismatchMessage =
    issues.length > 0 ? `Contract mismatch fallback: ${Array.from(new Set(issues)).join(", ")}` : null;
  asset.error = [upstreamError, contractMismatchMessage].filter(Boolean).join(" | ") || undefined;

  return asset;
}

export function parseUpload(input: unknown): UploadItem {
  if (!isObject(input)) throw new Error("Invalid upload payload");
  if (typeof input.id !== "string") throw new Error("Invalid upload.id");
  if (typeof input.projectId !== "string") throw new Error("Invalid upload.projectId");
  if (typeof input.assetId !== "string") throw new Error("Invalid upload.assetId");
  if (!uploadStatuses.includes(input.status as UploadStatus)) throw new Error("Invalid upload.status");
  if (typeof input.createdAt !== "string") throw new Error("Invalid upload.createdAt");
  if (typeof input.updatedAt !== "string") throw new Error("Invalid upload.updatedAt");

  return {
    id: input.id,
    projectId: input.projectId,
    assetId: input.assetId,
    status: input.status as UploadStatus,
    error: typeof input.error === "string" ? input.error : undefined,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

export function parseProjectList(input: unknown): Project[] {
  return parseCollectionItems(input, "Invalid projects response").map(parseProject);
}

export function parseProjectListPage(input: unknown): ProjectListPayload {
  const data = unwrapData(input);
  if (!isObject(data)) throw new Error("Invalid projects response");
  if (!Array.isArray(data.items)) throw new Error("Invalid projects response");

  return {
    items: data.items.map(parseProject),
    nextCursor: parseNextCursor(data.nextCursor),
  };
}

export function parseAssetList(input: unknown): Asset[] {
  return parseCollectionItems(input, "Invalid assets response").map((item, index) =>
    parseAsset(item, `asset-fallback-${index + 1}`)
  );
}

export function parseAssetListPage(input: unknown): AssetListPayload {
  const data = unwrapData(input);
  if (!isObject(data)) throw new Error("Invalid assets response");
  if (typeof data.projectId !== "string") throw new Error("Invalid assets projectId");
  if (typeof data.sort !== "string") throw new Error("Invalid assets sort");
  if (!Array.isArray(data.items)) throw new Error("Invalid assets response");

  return {
    projectId: data.projectId,
    sort: data.sort,
    items: data.items.map((item, index) => parseAsset(item, `asset-fallback-${index + 1}`)),
    nextCursor: parseNextCursor(data.nextCursor),
  };
}

export function parseUploadList(input: unknown): UploadItem[] {
  return parseCollectionItems(input, "Invalid uploads response").map(parseUpload);
}

export function parseUploadListPage(input: unknown): UploadListPayload {
  const data = unwrapData(input);
  if (!isObject(data)) throw new Error("Invalid uploads response");
  if (!Array.isArray(data.items)) throw new Error("Invalid uploads response");

  return {
    items: data.items.map(parseUpload),
    nextCursor: parseNextCursor(data.nextCursor),
  };
}

export function parseRuntimeReadiness(input: unknown): RuntimeReadinessPayload {
  const data = unwrapData(input);
  if (!isObject(data)) {
    throw new Error("Invalid runtime readiness response");
  }
  if (typeof data.checkedAt !== "string") {
    throw new Error("Invalid runtime readiness checkedAt");
  }
  if (!readinessStatuses.includes(data.overallStatus as RuntimeDependencyStatus)) {
    throw new Error("Invalid runtime readiness overallStatus");
  }
  if (!Array.isArray(data.dependencies)) {
    throw new Error("Invalid runtime readiness dependencies");
  }

  const dependencies: RuntimeReadinessDependency[] = data.dependencies.map((raw) => {
    if (!isObject(raw)) {
      throw new Error("Invalid runtime readiness dependency");
    }
    if (typeof raw.key !== "string") {
      throw new Error("Invalid runtime readiness dependency key");
    }
    if (typeof raw.label !== "string") {
      throw new Error("Invalid runtime readiness dependency label");
    }
    if (!readinessStatuses.includes(raw.status as RuntimeDependencyStatus)) {
      throw new Error("Invalid runtime readiness dependency status");
    }
    if (typeof raw.critical !== "boolean") {
      throw new Error("Invalid runtime readiness dependency critical");
    }
    if (typeof raw.message !== "string") {
      throw new Error("Invalid runtime readiness dependency message");
    }

    return {
      key: raw.key as RuntimeReadinessDependency["key"],
      label: raw.label,
      status: raw.status as RuntimeDependencyStatus,
      critical: raw.critical,
      message: raw.message,
    };
  });

  return {
    checkedAt: data.checkedAt,
    overallStatus: data.overallStatus as RuntimeDependencyStatus,
    dependencies,
  };
}
