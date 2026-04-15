import { NextRequest } from "next/server";
import { ApiError, apiError, getSearchParam, jsonOk } from "@/lib/api/http";
import { requireAuth } from "@/lib/api/auth";
import { listUploads } from "@/lib/integrations/runtime";
import { UPLOAD_STATUSES } from "@/lib/api/types";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const projectId = getSearchParam(request, "projectId") ?? "project_demo";
    const status = getSearchParam(request, "status");

    if (status && !UPLOAD_STATUSES.includes(status as (typeof UPLOAD_STATUSES)[number])) {
      throw new ApiError(400, "VALIDATION_ERROR", "Query param 'status' is invalid");
    }

    const items = listUploads(projectId, status as (typeof UPLOAD_STATUSES)[number] | undefined).map((item) => ({
      id: item.id,
      projectId: item.projectId,
      assetId: item.assetId,
      status: item.status,
      error: item.reasonMessage,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return jsonOk({
      projectId,
      items,
    });
  } catch (error) {
    return apiError(error);
  }
}
