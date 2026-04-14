import { NextRequest } from "next/server";
import {
  ApiError,
  apiError,
  parseJsonBody,
  requireArray,
  requireIdempotencyKey,
  requireString,
} from "@/lib/api/http";
import { withIdempotentReplay } from "@/lib/api/idempotency-store";
import { nowIso } from "@/lib/api/mock-store";
import { requireOnlineNodeForCapability } from "@/lib/bridge/runtime";
import { enqueueGeneration } from "@/lib/integrations/runtime";

export async function POST(request: NextRequest, context: { params: { projectId: string } }) {
  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await parseJsonBody(request);

    const prompt = requireString(body.prompt, "prompt", { max: 4000 });
    const provider = requireString(body.provider, "provider", { max: 50 });
    const model = requireString(body.model, "model", { max: 80 });
    const batch = Number(body.batch ?? 1);

    if (!Number.isInteger(batch) || batch < 1 || batch > 100) {
      throw new ApiError(400, "VALIDATION_ERROR", "Field 'batch' must be an integer in range 1..100");
    }

    if (body.tags && requireArray(body.tags, "tags").some((tag) => typeof tag !== "string")) {
      throw new ApiError(400, "VALIDATION_ERROR", "Field 'tags' must contain strings only");
    }

    const bridgeNode = requireOnlineNodeForCapability("generate");

    const replay = await withIdempotentReplay(
      `generate:${context.params.projectId}`,
      idempotencyKey,
      { prompt, provider, model, batch, tags: body.tags ?? null },
      () => {
        const jobs = enqueueGeneration({
          projectId: context.params.projectId,
          batch,
          prompt,
          provider,
          model,
          idempotencyKey,
        });

        return {
          status: 202,
          body: {
            ok: true,
            data: {
              projectId: context.params.projectId,
              idempotencyKey,
              acceptedAt: nowIso(),
              duplicate: false,
              idempotency: {
                key: idempotencyKey,
                scope: `generate:${context.params.projectId}`,
                replayed: false,
              },
              bridgeNode: {
                nodeId: bridgeNode.nodeId,
                machineId: bridgeNode.machineId,
                status: bridgeNode.status,
              },
              jobs: jobs.map((job) => ({
                id: job.id,
                type: job.type,
                status: job.status,
                traceId: job.traceId,
                assetId: job.assetId,
                prompt,
                provider,
                model,
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
            scope: `generate:${context.params.projectId}`,
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
