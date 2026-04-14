import { NextRequest } from "next/server";
import { ApiError, apiError, getSearchParam, jsonOk, requireString } from "@/lib/api/http";
import { summarizeRunByIdempotencyKey } from "@/lib/integrations/runtime";

export async function GET(request: NextRequest) {
  try {
    const projectId = requireString(getSearchParam(request, "projectId") ?? "project_demo", "projectId", {
      max: 64,
    });
    const idempotencyKey = requireString(getSearchParam(request, "idempotencyKey"), "idempotencyKey", {
      max: 128,
    });
    const typeRaw = getSearchParam(request, "type");
    const type = typeRaw ? requireString(typeRaw, "type", { max: 20 }) : undefined;

    if (type && !["generate", "metadata", "upload"].includes(type)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Query param 'type' must be one of generate|metadata|upload");
    }

    const summary = summarizeRunByIdempotencyKey({
      projectId,
      idempotencyKey,
      type: type as "generate" | "metadata" | "upload" | undefined,
    });

    return jsonOk(summary);
  } catch (error) {
    return apiError(error);
  }
}
