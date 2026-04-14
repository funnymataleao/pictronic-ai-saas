export type AssetStatus =
  | "generating"
  | "processing"
  | "ready"
  | "approved"
  | "uploading"
  | "uploaded"
  | "failed";

export type UploadStatus = "queued" | "uploading" | "uploaded" | "failed";

export type MetadataStatus = "ok" | "failed" | "timeout" | "pending";

export interface Project {
  id: string;
  name: string;
  imagesCount: number;
  approvedCount: number;
  thumbnailUrls: string[];
  createdAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  thumbnailUrl: string;
  originalUrl: string;
  prompt: string;
  provider: string;
  model: string;
  status: AssetStatus;
  metadataStatus: MetadataStatus;
  aspect?: string;
  title: string;
  tags: string[];
  error?: string;
  createdAt: string;
}

export interface UploadItem {
  id: string;
  projectId: string;
  assetId: string;
  status: UploadStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type LocalNodeStatus = "online" | "offline";

export interface LocalNode {
  nodeId: string;
  machineId: string;
  capabilities: string[];
  status: LocalNodeStatus;
  registeredAt: string;
  lastSeenAt: string;
  updatedAt: string;
}

export interface LocalNodeStatusPayload {
  items: LocalNode[];
  checkedAt: string;
}

export interface LocalNodeTokenPayload {
  mode: "registered" | "rotated";
  node: LocalNode;
  connectionToken: {
    token: string;
    tokenId: string;
    issuedAt: string;
    expiresAt: string;
  };
  issuedAt: string;
}

export type RuntimeDependencyStatus = "online" | "offline" | "degraded";

export interface RuntimeReadinessDependency {
  key: "app_runtime" | "bridge_routes" | "bridge_node" | "comfyui" | "ollama" | "redis_bullmq" | "queue";
  label: string;
  status: RuntimeDependencyStatus;
  critical: boolean;
  message: string;
}

export interface RuntimeReadinessPayload {
  checkedAt: string;
  overallStatus: RuntimeDependencyStatus;
  dependencies: RuntimeReadinessDependency[];
}

export interface ApiErrorPayload {
  message: string;
  code: string;
  details?: unknown;
}

export interface ApiSuccessEnvelope<T> {
  ok: true;
  data: T;
}

export interface ApiErrorEnvelope {
  ok: false;
  error: ApiErrorPayload;
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface AssetListPayload extends CursorPage<Asset> {
  projectId: string;
  sort: string;
}

export interface ProjectListPayload extends CursorPage<Project> {}

export interface UploadListPayload extends CursorPage<UploadItem> {}

export interface GenerateRequest {
  batch: number;
  prompt: string;
  provider: string;
  model: string;
}

export interface IdempotencyActivity {
  scope: "generate" | "upload" | "approve" | "metadata";
  key: string;
  duplicate: boolean;
  acceptedAt: string;
}

export interface UpdateMetadataRequest {
  title: string;
  tags: string[];
}

export interface CreateProjectRequest {
  name: string;
}
