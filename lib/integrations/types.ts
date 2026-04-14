export const INTEGRATION_QUEUES = ["generation", "metadata", "upload", "upload_dlq"] as const;

export const INTEGRATION_QUEUE_POLICIES = {
  generation: { attempts: 3, backoffMs: 2_000 },
  metadata: { attempts: 3, backoffMs: 2_000 },
  upload: { attempts: 5, backoffMs: 10_000 },
  upload_dlq: { attempts: 1, backoffMs: 0 },
} as const;

export type IntegrationQueueName = (typeof INTEGRATION_QUEUES)[number];
export type IntegrationJobStatus = "pending" | "active" | "completed" | "failed";

export interface IntegrationJob {
  id: string;
  queue: IntegrationQueueName;
  type: "generate" | "metadata" | "upload";
  status: IntegrationJobStatus;
  projectId: string;
  assetId?: string;
  traceId: string;
  attemptsMade: number;
  maxAttempts: number;
  retryBackoffMs: number;
  reasonCode?: string;
  reasonMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadRecord {
  id: string;
  assetId: string;
  projectId: string;
  provider: "adobe";
  status: "queued" | "uploading" | "uploaded" | "failed";
  retryCount: number;
  reasonCode?: string;
  reasonMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobEventRecord {
  id: string;
  jobId: string;
  type: "generate" | "metadata" | "upload";
  status: IntegrationJobStatus;
  traceId: string;
  eventName: string;
  projectId: string;
  assetId?: string;
  reasonCode?: string;
  reasonMessage?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface AdobeUploadInput {
  traceId: string;
  assetId: string;
  projectId: string;
  imagePath: string;
  csvContent: string;
}

export interface AdobeUploadAttempt {
  attempt: number;
  traceId: string;
  ok: boolean;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface AdobeUploadResult {
  attempts: AdobeUploadAttempt[];
  remoteImagePath: string;
  remoteCsvPath: string;
}
