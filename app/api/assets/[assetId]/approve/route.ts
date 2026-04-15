import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk, parseJsonBody, requireIdempotencyKey, requireString } from "@/lib/api/http";
import { requireAuth } from "@/lib/api/auth";
import { approveAssetAndEnqueueUpload, getAsset } from "@/lib/integrations/runtime";

export async function POST(
  request: NextRequest,
  context: { params: { assetId: string } }
) {
  try {
    await requireAuth();
    const body = await parseJsonBody(request);
    const projectId = requireString(body.projectId, "projectId", { max: 120 });

    const asset = getAsset(context.params.assetId);
    if (!asset) {
      throw new ApiError(404, "ASSET_NOT_FOUND", "Asset not found");
    }

    const idempotencyKey = requireIdempotencyKey(request);
    const { upload, job } = await approveAssetAndEnqueueUpload({
      assetId: context.params.assetId,
      projectId,
      idempotencyKey,
    });

    return jsonOk({
      assetId: context.params.assetId,
      projectId,
      status: "approved",
      upload: {
        id: upload.id,
        status: upload.status,
        reasonCode: upload.reasonCode,
        reasonMessage: upload.reasonMessage,
      },
      job: {
        id: job.id,
        status: job.status,
        attemptsMade: job.attemptsMade,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
