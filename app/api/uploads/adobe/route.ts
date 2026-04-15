import { NextRequest } from "next/server";
import {
  ApiError,
  apiError,
  parseJsonBody,
  requireArray,
  requireIdempotencyKey,
  requireString,
  requireUUID,
} from "@/lib/api/http";
import { withIdempotentReplay } from "@/lib/api/idempotency-store";
import { nowIso } from "@/lib/api/mock-store";
import { requireAuth } from "@/lib/api/auth";
import { enqueueUploadJobs } from "@/lib/integrations/runtime";

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await parseJsonBody(request);
    const provider = requireString(body.provider ?? "adobe", "provider", { max: 20 }).toLowerCase();

    if (provider !== "adobe") {
      throw new ApiError(400, "VALIDATION_ERROR", "Only adobe provider is supported in MVP");
    }

    const assetIds = requireArray(body.assetIds, "assetIds").map((assetId) =>
      requireString(assetId, "assetIds[]", { max: 64 })
    );

    if (assetIds.length === 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "Field 'assetIds' cannot be empty");
    }
    if (new Set(assetIds).size !== assetIds.length) {
      throw new ApiError(400, "VALIDATION_ERROR", "Field 'assetIds' must contain unique asset ids");
    }

    const projectId = requireString(body.projectId ?? "project_demo", "projectId", { max: 64 });
    const batchId = typeof body.batch_id === "string" ? requireUUID(body.batch_id.trim(), "batch_id") : undefined;

    const replay = await withIdempotentReplay(
      `uploads:${projectId}`,
      idempotencyKey,
      { provider, projectId, batchId: batchId ?? null, assetIds },
      async () => {
        const jobs = await enqueueUploadJobs({
          projectId,
          assetIds,
          idempotencyKey,
          batchId,
        });

        return {
          status: 202,
          body: {
            ok: true,
            data: {
              projectId,
              idempotencyKey,
              acceptedAt: nowIso(),
              duplicate: false,
              idempotency: {
                key: idempotencyKey,
                scope: `uploads:${projectId}`,
                replayed: false,
              },
              jobs: jobs.map((jobOutput) => ({
                id: jobOutput.job.id,
                type: jobOutput.job.type,
                status: jobOutput.job.status,
                provider,
                assetId: jobOutput.job.assetId,
                traceId: jobOutput.job.traceId,
                attemptsMade: jobOutput.job.attemptsMade,
                reasonCode: jobOutput.upload.reasonCode ?? null,
                reasonMessage: jobOutput.upload.reasonMessage ?? null,
              })),
            },
          },
        };
      }
    );

    return Response.json(
      {
        ...replay.body,
        data: {
          ...replay.body.data,
          duplicate: replay.replayed,
          idempotency: {
            key: idempotencyKey,
            scope: `uploads:${replay.body.data.projectId}`,
            replayed: replay.replayed,
          },
        },
      },
      { status: replay.replayed ? 200 : replay.status }
    );
  } catch (error) {
    return apiError(error);
  }
}
