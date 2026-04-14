import { AssetStatus, UploadStatus } from "@/lib/api/types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function fakeId(prefix: string): string {
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${random}`;
}

export function projectStub(projectId?: string) {
  return {
    id: projectId ?? fakeId("proj"),
    userId: fakeId("usr"),
    name: "Untitled project",
    promptTemplate: "",
    styleHints: "",
    tagsHints: "",
    providerDefault: "local",
    uploadDefaults: {},
    createdAt: nowIso(),
  };
}

export function assetStub(projectId: string, status: AssetStatus = "ready") {
  return {
    id: fakeId("ast"),
    projectId,
    originalUrl: "https://example.com/original.png",
    thumbnailUrl: "https://example.com/thumb.webp",
    prompt: "minimalist office workspace, natural light",
    provider: "local",
    model: "sdxl",
    status,
    metadataStatus: status === "ready" ? "ok" : "pending",
    createdAt: nowIso(),
  };
}

export function uploadStub(projectId: string, status: UploadStatus = "queued") {
  return {
    id: fakeId("upl"),
    projectId,
    assetId: fakeId("ast"),
    provider: "adobe",
    status,
    error: null,
    createdAt: nowIso(),
  };
}
