import { NextRequest } from "next/server";
import { ApiError, apiError, getSearchParam, jsonOk, requireString } from "@/lib/api/http";
import { listJobEventsByAsset, listJobEventsByTraceId, listRecentJobEvents } from "@/lib/integrations/runtime";
import { JobEventRecord } from "@/lib/integrations/types";

interface EnrichedEventTelemetry {
  batch_id: string | null;
  trace_id: string;
  queue_latency_ms: number | null;
  worker_duration_ms: number | null;
  retry_count: number;
  final_status: string | null;
}

interface JobTiming {
  enqueueAt?: number;
  startedAt?: number;
  finalAt?: number;
  finalStatus?: string;
  batchId?: string;
  retryCount: number;
}

function toMs(iso: string): number {
  return new Date(iso).getTime();
}

function buildJobTiming(items: JobEventRecord[]): Map<string, JobTiming> {
  const byJob = new Map<string, JobTiming>();
  const asc = items.slice().sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));

  for (const item of asc) {
    const jobId = item.jobId;
    const eventName = item.eventName;
    const status = item.status;
    const createdAtMs = toMs(item.createdAt);
    const payload = item.payload;

    const state = byJob.get(jobId) ?? { retryCount: 0 };

    if (!state.batchId && payload?.batchId && typeof payload.batchId === "string") {
      state.batchId = payload.batchId;
    }
    if (!state.batchId && payload?.batch_id && typeof payload.batch_id === "string") {
      state.batchId = payload.batch_id;
    }

    if (!state.enqueueAt && eventName.includes("enqueue")) {
      state.enqueueAt = createdAtMs;
    }
    if (!state.startedAt && status === "active") {
      state.startedAt = createdAtMs;
    }
    if (status === "completed" || status === "failed") {
      state.finalAt = createdAtMs;
      state.finalStatus = status;
    }
    if (eventName === "adobe.attempt.failed") {
      state.retryCount += 1;
    }

    byJob.set(jobId, state);
  }

  return byJob;
}

export async function GET(request: NextRequest) {
  try {
    const traceId = getSearchParam(request, "traceId");
    const assetId = getSearchParam(request, "assetId");
    const limitRaw = getSearchParam(request, "limit");

    let items;
    if (traceId) {
      items = listJobEventsByTraceId(requireString(traceId, "traceId", { max: 140 }));
    } else if (assetId) {
      items = listJobEventsByAsset(requireString(assetId, "assetId", { max: 64 }));
    } else {
      const limit = limitRaw ? Number(limitRaw) : 40;
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw new ApiError(400, "VALIDATION_ERROR", "Query param 'limit' must be an integer in range 1..200");
      }
      items = listRecentJobEvents(limit);
    }

    const timingByJob = buildJobTiming(items);

    const enriched = items.map((item) => {
      const jobId = item.jobId;
      const timing = timingByJob.get(jobId);

      const telemetry: EnrichedEventTelemetry = {
        batch_id: timing?.batchId ?? null,
        trace_id: item.traceId,
        queue_latency_ms:
          timing?.enqueueAt !== undefined && timing.startedAt !== undefined
            ? Math.max(0, timing.startedAt - timing.enqueueAt)
            : null,
        worker_duration_ms:
          timing?.startedAt !== undefined && timing.finalAt !== undefined
            ? Math.max(0, timing.finalAt - timing.startedAt)
            : null,
        retry_count: timing?.retryCount ?? 0,
        final_status: timing?.finalStatus ?? null,
      };

      return {
        ...item,
        batch_id: telemetry.batch_id,
        trace_id: telemetry.trace_id,
        queue_latency_ms: telemetry.queue_latency_ms,
        worker_duration_ms: telemetry.worker_duration_ms,
        retry_count: telemetry.retry_count,
        final_status: telemetry.final_status,
        telemetry,
      };
    });

    return jsonOk({
      items: enriched,
    });
  } catch (error) {
    return apiError(error);
  }
}
