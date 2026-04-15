import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk } from "@/lib/api/http";
import { requireAuth } from "@/lib/api/auth";
import { getAsset } from "@/lib/integrations/runtime";

export async function DELETE(
  _request: NextRequest,
  context: { params: { assetId: string } }
) {
  try {
    await requireAuth();

    const asset = getAsset(context.params.assetId);
    if (!asset) {
      throw new ApiError(404, "ASSET_NOT_FOUND", "Asset not found");
    }

    return jsonOk({
      assetId: context.params.assetId,
      status: "deleted",
    });
  } catch (error) {
    return apiError(error);
  }
}
