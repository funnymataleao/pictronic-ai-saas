export const ASSET_STATUSES = [
  "generating",
  "processing",
  "ready",
  "approved",
  "uploading",
  "uploaded",
  "failed",
] as const;

export const JOB_TYPES = ["generate", "metadata", "upload"] as const;

export const JOB_STATUSES = ["pending", "active", "completed", "failed"] as const;

export const UPLOAD_STATUSES = ["queued", "uploading", "uploaded", "failed"] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type JobType = (typeof JOB_TYPES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];
