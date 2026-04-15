import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk, parseJsonBody, requireString } from "@/lib/api/http";
import { requireAuth } from "@/lib/api/auth";
import { getAsset, updateAssetMetadata } from "@/lib/integrations/runtime";

export async function PATCH(
  request: NextRequest,
  context: { params: { assetId: string } }
) {
  try {
    await requireAuth();

    const body = await parseJsonBody(request);
    const asset = getAsset(context.params.assetId);

    if (!asset) {
      throw new ApiError(404, "ASSET_NOT_FOUND", "Asset not found");
    }

    const title = body.title !== undefined ? requireString(body.title, "title", { allowEmpty: true }) : undefined;
    const tags = body.tags !== undefined ? (Array.isArray(body.tags) ? body.tags as string[] : undefined) : undefined;

    if (title === undefined && tags === undefined) {
      throw new ApiError(400, "VALIDATION_ERROR", "At least one of 'title' or 'tags' must be provided");
    }

    const updated = updateAssetMetadata(context.params.assetId, {
      title: title ?? asset.title,
      tags: tags ?? asset.tags,
    });

    return jsonOk({
      assetId: context.params.assetId,
      title: updated?.title,
      tags: updated?.tags,
      metadataStatus: updated?.metadataStatus,
    });
  } catch (error) {
    return apiError(error);
  }
}
