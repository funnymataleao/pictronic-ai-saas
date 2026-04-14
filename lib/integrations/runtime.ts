import { fakeId, nowIso } from "@/lib/api/mock-store";
import { SimulatedAdobeFtpAdapter } from "@/lib/integrations/adobe-ftp-adapter";
import {
  INTEGRATION_QUEUE_POLICIES,
  IntegrationJob,
  IntegrationQueueName,
  JobEventRecord,
  UploadRecord,
} from "@/lib/integrations/types";

interface AssetRuntime {
  assetId: string;
  projectId: string;
  prompt: string;
  provider: string;
  model: string;
  status: "generating" | "processing" | "ready" | "approved" | "uploading" | "uploaded" | "failed";
  metadataStatus: "pending" | "ok" | "failed" | "timeout";
  title: string;
  tags: string[];
  traceId?: string;
  createdAt: string;
  updatedAt: string;
}

interface IntegrationRuntimeState {
  jobs: IntegrationJob[];
  uploads: UploadRecord[];
  jobEvents: JobEventRecord[];
  assets: Map<string, AssetRuntime>;
}

declare global {
  // Shared in-memory runtime across route handlers in the same Node.js process.
  // eslint-disable-next-line no-var
  var __pictronicIntegrationRuntime__: IntegrationRuntimeState | undefined;
}

function getIntegrationRuntimeState(): IntegrationRuntimeState {
  if (!globalThis.__pictronicIntegrationRuntime__) {
    globalThis.__pictronicIntegrationRuntime__ = {
      jobs: [],
      uploads: [],
      jobEvents: [],
      assets: new Map<string, AssetRuntime>(),
    };
  }

  return globalThis.__pictronicIntegrationRuntime__;
}

const state = getIntegrationRuntimeState();
const jobs = state.jobs;
const uploads = state.uploads;
const jobEvents = state.jobEvents;
const assets = state.assets;

function pushJobEvent(record: Omit<JobEventRecord, "id" | "createdAt">): JobEventRecord {
  const event: JobEventRecord = {
    id: fakeId("evt"),
    createdAt: nowIso(),
    ...record,
  };
  jobEvents.unshift(event);
  return event;
}

function createJob(input: {
  queue: IntegrationQueueName;
  type: IntegrationJob["type"];
  projectId: string;
  traceId: string;
  assetId?: string;
}): IntegrationJob {
  const policy = INTEGRATION_QUEUE_POLICIES[input.queue];
  const job: IntegrationJob = {
    id: fakeId("job"),
    queue: input.queue,
    type: input.type,
    status: "pending",
    projectId: input.projectId,
    assetId: input.assetId,
    traceId: input.traceId,
    attemptsMade: 0,
    maxAttempts: policy.attempts,
    retryBackoffMs: policy.backoffMs,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  jobs.unshift(job);
  pushJobEvent({
    jobId: job.id,
    type: job.type,
    status: "pending",
    traceId: job.traceId,
    eventName: `${job.queue}.enqueue`,
    projectId: job.projectId,
    assetId: job.assetId,
    payload: {
      queue: job.queue,
      maxAttempts: job.maxAttempts,
      retryBackoffMs: job.retryBackoffMs,
    },
  });
  return job;
}

function updateJob(
  job: IntegrationJob,
  status: IntegrationJob["status"],
  eventName: string,
  reason?: { reasonCode: string; reasonMessage: string },
  payload?: Record<string, unknown>
): void {
  job.status = status;
  job.updatedAt = nowIso();
  if (reason) {
    job.reasonCode = reason.reasonCode;
    job.reasonMessage = reason.reasonMessage;
  }

  pushJobEvent({
    jobId: job.id,
    type: job.type,
    status,
    traceId: job.traceId,
    eventName,
    projectId: job.projectId,
    assetId: job.assetId,
    reasonCode: reason?.reasonCode,
    reasonMessage: reason?.reasonMessage,
    payload,
  });
}

function ensureAsset(
  projectId: string,
  options?: {
    assetId?: string;
    prompt?: string;
    provider?: string;
    model?: string;
    traceId?: string;
  }
): AssetRuntime {
  const assetId = options?.assetId;
  const id = assetId ?? fakeId("asset");
  const existing = assets.get(id);
  if (existing) {
    if (options?.prompt) existing.prompt = options.prompt;
    if (options?.provider) existing.provider = options.provider;
    if (options?.model) existing.model = options.model;
    if (options?.traceId) existing.traceId = options.traceId;
    return existing;
  }

  const created: AssetRuntime = {
    assetId: id,
    projectId,
    prompt: options?.prompt ?? "minimalist office workspace, natural light",
    provider: options?.provider ?? "local",
    model: options?.model ?? "sdxl",
    status: "ready",
    metadataStatus: "ok",
    title: "",
    tags: [],
    traceId: options?.traceId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  assets.set(id, created);
  return created;
}

function setAssetStatus(params: {
  assetId: string;
  status: AssetRuntime["status"];
  job?: IntegrationJob;
  eventName?: string;
}): void {
  const { assetId, status, job, eventName } = params;
  const target = assets.get(assetId);
  if (!target) return;
  const previous = target.status;
  target.status = status;
  target.updatedAt = nowIso();

  if (job) {
    pushJobEvent({
      jobId: job.id,
      type: job.type,
      status: "active",
      traceId: job.traceId,
      eventName: eventName ?? "asset.status.changed",
      projectId: job.projectId,
      assetId,
      payload: {
        from: previous,
        to: status,
      },
    });
  }
}

function setAssetMetadataStatus(params: {
  assetId: string;
  metadataStatus: AssetRuntime["metadataStatus"];
  job?: IntegrationJob;
  eventName?: string;
}): void {
  const { assetId, metadataStatus, job, eventName } = params;
  const target = assets.get(assetId);
  if (!target) return;
  const previous = target.metadataStatus;
  target.metadataStatus = metadataStatus;
  target.updatedAt = nowIso();

  if (job) {
    pushJobEvent({
      jobId: job.id,
      type: job.type,
      status: "active",
      traceId: job.traceId,
      eventName: eventName ?? "asset.metadata_status.changed",
      projectId: job.projectId,
      assetId,
      payload: {
        from: previous,
        to: metadataStatus,
      },
    });
  }
}

function ensureUpload(projectId: string, assetId: string): UploadRecord {
  const existing = uploads.find((item) => item.assetId === assetId && item.projectId === projectId);
  if (existing) {
    return existing;
  }

  const created: UploadRecord = {
    id: fakeId("upl"),
    projectId,
    assetId,
    provider: "adobe",
    status: "queued",
    retryCount: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  uploads.unshift(created);
  return created;
}

function createTraceId(seed?: string): string {
  return `trace_${seed ?? fakeId("pc")}`;
}

async function processUploadJob(job: IntegrationJob): Promise<UploadRecord> {
  if (!job.assetId) {
    const reason = {
      reasonCode: "ADOBE_UNKNOWN_ERROR",
      reasonMessage: "Upload job is missing assetId",
    };
    updateJob(job, "failed", "upload.failed", reason);
    throw new Error(reason.reasonMessage);
  }

  const asset = ensureAsset(job.projectId, { assetId: job.assetId, traceId: job.traceId });
  const upload = ensureUpload(job.projectId, asset.assetId);

  setAssetStatus({
    assetId: asset.assetId,
    status: "uploading",
    job,
    eventName: "asset.status.uploading",
  });
  upload.status = "uploading";
  upload.updatedAt = nowIso();
  updateJob(job, "active", "upload.started", undefined, { provider: upload.provider });

  const adapter = new SimulatedAdobeFtpAdapter({ maxAttempts: job.maxAttempts });
  const result = await adapter.upload(
    {
      traceId: job.traceId,
      assetId: asset.assetId,
      projectId: asset.projectId,
      imagePath: `/assets/${asset.assetId}.jpg`,
      csvContent: `filename,title,keywords\n${asset.assetId}.jpg,Generated title,stock|workflow|demo`,
    }
  );

  result.attempts.forEach((attempt) => {
    pushJobEvent({
      jobId: job.id,
      type: job.type,
      status: attempt.ok ? "active" : "failed",
      traceId: attempt.traceId,
      eventName: attempt.ok ? "adobe.attempt.succeeded" : "adobe.attempt.failed",
      projectId: job.projectId,
      assetId: job.assetId,
      reasonCode: attempt.reasonCode,
      reasonMessage: attempt.reasonMessage,
      payload: { attempt: attempt.attempt },
    });
  });

  const successfulAttempt = result.attempts.find((attempt) => attempt.ok);
  job.attemptsMade = result.attempts.length;

  if (successfulAttempt) {
    upload.status = "uploaded";
    upload.retryCount = Math.max(0, result.attempts.length - 1);
    upload.reasonCode = undefined;
    upload.reasonMessage = undefined;
    upload.updatedAt = nowIso();
    setAssetStatus({
      assetId: asset.assetId,
      status: "uploaded",
      job,
      eventName: "asset.status.uploaded",
    });
    updateJob(job, "completed", "upload.completed", undefined, {
      attempts: result.attempts.length,
    });
    return upload;
  }

  const lastAttempt = result.attempts[result.attempts.length - 1];
  const reason = {
    reasonCode: lastAttempt?.reasonCode ?? "ADOBE_UNKNOWN_ERROR",
    reasonMessage: lastAttempt?.reasonMessage ?? "Upload failed after retries",
  };

  upload.status = "failed";
  upload.retryCount = result.attempts.length;
  upload.reasonCode = reason.reasonCode;
  upload.reasonMessage = reason.reasonMessage;
  upload.updatedAt = nowIso();
  setAssetStatus({
    assetId: asset.assetId,
    status: "failed",
    job,
    eventName: "asset.status.failed",
  });
  updateJob(job, "failed", "upload.failed", reason, { attempts: result.attempts.length });

  const dlqJob = createJob({
    queue: "upload_dlq",
    type: "upload",
    projectId: job.projectId,
    assetId: job.assetId,
    traceId: job.traceId,
  });

  updateJob(dlqJob, "failed", "upload.dead_lettered", reason);
  return upload;
}

function enqueueMetadataAfterGeneration(generationJob: IntegrationJob): IntegrationJob {
  const metadataJob = createJob({
    queue: "metadata",
    type: "metadata",
    projectId: generationJob.projectId,
    assetId: generationJob.assetId,
    traceId: generationJob.traceId,
  });

  if (generationJob.assetId) {
    setAssetStatus({
      assetId: generationJob.assetId,
      status: "processing",
      job: metadataJob,
      eventName: "asset.status.processing",
    });
    setAssetMetadataStatus({
      assetId: generationJob.assetId,
      metadataStatus: "pending",
      job: metadataJob,
      eventName: "asset.metadata_status.pending",
    });
  }

  updateJob(metadataJob, "active", "metadata.started");
  updateJob(metadataJob, "completed", "metadata.completed");

  if (generationJob.assetId) {
    setAssetMetadataStatus({
      assetId: generationJob.assetId,
      metadataStatus: "ok",
      job: metadataJob,
      eventName: "asset.metadata_status.ok",
    });
    setAssetStatus({
      assetId: generationJob.assetId,
      status: "ready",
      job: metadataJob,
      eventName: "asset.status.ready",
    });
  }

  return metadataJob;
}

export function enqueueGeneration(params: {
  projectId: string;
  batch: number;
  prompt: string;
  provider: string;
  model: string;
  idempotencyKey: string;
}): IntegrationJob[] {
  const jobsCreated: IntegrationJob[] = [];

  for (let i = 0; i < params.batch; i += 1) {
    const traceId = createTraceId(`${params.idempotencyKey}_${i + 1}`);
    const asset = ensureAsset(params.projectId, {
      prompt: params.prompt,
      provider: params.provider,
      model: params.model,
      traceId,
    });
    const generationJob = createJob({
      queue: "generation",
      type: "generate",
      projectId: params.projectId,
      assetId: asset.assetId,
      traceId,
    });

    setAssetStatus({
      assetId: asset.assetId,
      status: "generating",
      job: generationJob,
      eventName: "asset.status.generating",
    });
    setAssetMetadataStatus({
      assetId: asset.assetId,
      metadataStatus: "pending",
      job: generationJob,
      eventName: "asset.metadata_status.pending",
    });
    updateJob(generationJob, "active", "generation.started", undefined, {
      prompt: params.prompt,
      provider: params.provider,
      model: params.model,
    });
    updateJob(generationJob, "completed", "generation.completed");

    enqueueMetadataAfterGeneration(generationJob);
    jobsCreated.push(generationJob);
  }

  return jobsCreated;
}

export async function approveAssetAndEnqueueUpload(params: {
  assetId: string;
  projectId: string;
  idempotencyKey?: string;
  batchId?: string;
}): Promise<{ upload: UploadRecord; job: IntegrationJob }> {
  const asset = ensureAsset(params.projectId, { assetId: params.assetId });

  const traceId = createTraceId(params.idempotencyKey ?? params.assetId);
  const uploadJob = createJob({
    queue: "upload",
    type: "upload",
    projectId: params.projectId,
    assetId: params.assetId,
    traceId,
  });

  setAssetStatus({
    assetId: asset.assetId,
    status: "approved",
    job: uploadJob,
    eventName: "asset.status.approved",
  });

  pushJobEvent({
    jobId: uploadJob.id,
    type: uploadJob.type,
    status: "pending",
    traceId,
    eventName: "asset.approved",
    projectId: params.projectId,
    assetId: params.assetId,
    payload: params.batchId ? { batchId: params.batchId } : undefined,
  });

  const upload = await processUploadJob(uploadJob);
  return { upload, job: uploadJob };
}

export async function enqueueUploadJobs(params: {
  projectId: string;
  assetIds: string[];
  idempotencyKey: string;
  batchId?: string;
}): Promise<Array<{ upload: UploadRecord; job: IntegrationJob }>> {
  const output: Array<{ upload: UploadRecord; job: IntegrationJob }> = [];

  for (let index = 0; index < params.assetIds.length; index += 1) {
    const assetId = params.assetIds[index];
    const traceId = createTraceId(`${params.idempotencyKey}_${index + 1}`);
    const uploadJob = createJob({
      queue: "upload",
      type: "upload",
      projectId: params.projectId,
      assetId,
      traceId,
    });

    pushJobEvent({
      jobId: uploadJob.id,
      type: uploadJob.type,
      status: "pending",
      traceId,
      eventName: "upload.enqueue.requested",
      projectId: params.projectId,
      assetId,
      payload: params.batchId ? { batchId: params.batchId } : undefined,
    });

    const upload = await processUploadJob(uploadJob);
    output.push({ upload, job: uploadJob });
  }

  return output;
}

export function listUploads(projectId: string, status?: UploadRecord["status"]): UploadRecord[] {
  return uploads.filter((item) => item.projectId === projectId && (!status || item.status === status));
}

export function listAssets(
  projectId: string,
  status?: AssetRuntime["status"]
): Array<{
  id: string;
  projectId: string;
  originalUrl: string;
  thumbnailUrl: string;
  prompt: string;
  provider: string;
  model: string;
  status: AssetRuntime["status"];
  metadataStatus: AssetRuntime["metadataStatus"];
  createdAt: string;
  updatedAt: string;
  title: string;
  tags: string[];
  traceId?: string;
}> {
  return Array.from(assets.values())
    .filter((item) => item.projectId === projectId && (!status || item.status === status))
    .sort((left, right) => {
      if (left.createdAt === right.createdAt) return right.assetId.localeCompare(left.assetId);
      return right.createdAt.localeCompare(left.createdAt);
    })
    .map((item) => ({
      id: item.assetId,
      projectId: item.projectId,
      originalUrl: `https://example.com/original/${item.assetId}.jpg`,
      thumbnailUrl: `https://example.com/thumb/${item.assetId}.webp`,
      prompt: item.prompt,
      provider: item.provider,
      model: item.model,
      status: item.status,
      metadataStatus: item.metadataStatus,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      title: item.title,
      tags: item.tags,
      traceId: item.traceId,
    }));
}

export function listProjectIds(): string[] {
  const ids = new Set<string>();

  for (const asset of assets.values()) {
    ids.add(asset.projectId);
  }

  for (const upload of uploads) {
    ids.add(upload.projectId);
  }

  for (const job of jobs) {
    ids.add(job.projectId);
  }

  if (ids.size === 0) {
    ids.add("project_demo");
  }

  return Array.from(ids).sort((left, right) => left.localeCompare(right));
}

export function summarizeProjectAssets(projectId: string): {
  imagesCount: number;
  approvedCount: number;
  thumbnailUrls: string[];
  latestAssetAt: string | null;
} {
  const items = listAssets(projectId);
  const approvedCount = items.filter((item) =>
    item.status === "approved" || item.status === "uploading" || item.status === "uploaded"
  ).length;

  return {
    imagesCount: items.length,
    approvedCount,
    thumbnailUrls: items.slice(0, 4).map((item) => item.thumbnailUrl),
    latestAssetAt: items[0]?.updatedAt ?? null,
  };
}

export function getAsset(assetId: string): ReturnType<typeof listAssets>[number] | null {
  const item = assets.get(assetId);
  if (!item) return null;
  return {
    id: item.assetId,
    projectId: item.projectId,
    originalUrl: `https://example.com/original/${item.assetId}.jpg`,
    thumbnailUrl: `https://example.com/thumb/${item.assetId}.webp`,
    prompt: item.prompt,
    provider: item.provider,
    model: item.model,
    status: item.status,
    metadataStatus: item.metadataStatus,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    title: item.title,
    tags: item.tags,
    traceId: item.traceId,
  };
}

export function updateAssetMetadata(assetId: string, input: { title: string; tags: string[] }) {
  const target = assets.get(assetId);
  if (!target) return null;
  target.title = input.title;
  target.tags = input.tags;
  target.metadataStatus = "ok";
  target.updatedAt = nowIso();
  return getAsset(assetId);
}

export function regenerateAssetMetadata(assetId: string, mode: "title" | "tags" | "both") {
  const target = assets.get(assetId);
  if (!target) return null;

  target.metadataStatus = "pending";
  target.updatedAt = nowIso();

  if (mode === "title" || mode === "both") {
    target.title = "Recovered metadata title";
  }
  if (mode === "tags" || mode === "both") {
    target.tags = ["recovered", "metadata", "stock"];
  }

  target.metadataStatus = "ok";
  if (target.status === "failed") {
    target.status = "ready";
  }
  target.updatedAt = nowIso();
  return getAsset(assetId);
}

export function listJobEventsByAsset(assetId: string): JobEventRecord[] {
  return jobEvents.filter((event) => event.assetId === assetId);
}

export function listJobEventsByTraceId(traceId: string): JobEventRecord[] {
  return jobEvents.filter((event) => event.traceId === traceId);
}

export function listRecentJobEvents(limit = 40): JobEventRecord[] {
  return jobEvents.slice(0, limit);
}

export function summarizeRunByIdempotencyKey(params: {
  projectId: string;
  idempotencyKey: string;
  type?: IntegrationJob["type"];
}): {
  projectId: string;
  idempotencyKey: string;
  tracePrefix: string;
  totalJobs: number;
  totalAssets: number;
  statusCounts: Record<IntegrationJob["status"], number>;
  typeCounts: Record<IntegrationJob["type"], number>;
  traces: Array<{
    traceId: string;
    assetId?: string;
    type: IntegrationJob["type"];
    status: IntegrationJob["status"];
    attemptsMade: number;
    reasonCode?: string;
    reasonMessage?: string;
    updatedAt: string;
  }>;
  eventsCount: number;
  latestEventAt?: string;
} {
  const tracePrefix = `trace_${params.idempotencyKey}`;
  const matchedJobs = jobs.filter(
    (job) =>
      job.projectId === params.projectId &&
      job.traceId.startsWith(tracePrefix) &&
      (!params.type || job.type === params.type)
  );

  const statusCounts: Record<IntegrationJob["status"], number> = {
    pending: 0,
    active: 0,
    completed: 0,
    failed: 0,
  };
  const typeCounts: Record<IntegrationJob["type"], number> = {
    generate: 0,
    metadata: 0,
    upload: 0,
  };
  const assetIds = new Set<string>();

  matchedJobs.forEach((job) => {
    statusCounts[job.status] += 1;
    typeCounts[job.type] += 1;
    if (job.assetId) {
      assetIds.add(job.assetId);
    }
  });

  const traceIds = new Set(matchedJobs.map((job) => job.traceId));
  const matchedEvents = jobEvents.filter(
    (event) => event.projectId === params.projectId && traceIds.has(event.traceId)
  );
  const latestEventAt = matchedEvents.reduce<string | undefined>(
    (latest, event) => (!latest || event.createdAt > latest ? event.createdAt : latest),
    undefined
  );

  return {
    projectId: params.projectId,
    idempotencyKey: params.idempotencyKey,
    tracePrefix,
    totalJobs: matchedJobs.length,
    totalAssets: assetIds.size,
    statusCounts,
    typeCounts,
    traces: matchedJobs.map((job) => ({
      traceId: job.traceId,
      assetId: job.assetId,
      type: job.type,
      status: job.status,
      attemptsMade: job.attemptsMade,
      reasonCode: job.reasonCode,
      reasonMessage: job.reasonMessage,
      updatedAt: job.updatedAt,
    })),
    eventsCount: matchedEvents.length,
    latestEventAt,
  };
}

export function summarizeQueueHealth(): {
  pendingJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalJobs: number;
} {
  const counters = {
    pendingJobs: 0,
    activeJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    totalJobs: jobs.length,
  };

  for (const job of jobs) {
    if (job.status === "pending") counters.pendingJobs += 1;
    if (job.status === "active") counters.activeJobs += 1;
    if (job.status === "completed") counters.completedJobs += 1;
    if (job.status === "failed") counters.failedJobs += 1;
  }

  return counters;
}
