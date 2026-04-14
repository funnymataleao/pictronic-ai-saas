import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk, parseJsonBody, requireString } from "@/lib/api/http";
import { requireBridgeAdminKey } from "@/lib/bridge/http";
import { rotateConnectionToken } from "@/lib/bridge/runtime";

function parseOptionalTtlSeconds(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const ttlSeconds = Number(value);
  if (!Number.isInteger(ttlSeconds)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Field 'ttlSeconds' must be an integer");
  }

  return ttlSeconds;
}

export async function POST(request: NextRequest, context: { params: { nodeId: string } }) {
  try {
    requireBridgeAdminKey(request);
    const body: Record<string, unknown> = await parseJsonBody(request).catch(
      () => ({} as Record<string, unknown>)
    );

    const rotated = rotateConnectionToken({
      nodeId: requireString(context.params.nodeId, "nodeId", { max: 120 }),
      ttlSeconds: parseOptionalTtlSeconds(body.ttlSeconds),
    });

    return jsonOk({
      node: rotated.node,
      connectionToken: rotated.connectionToken,
      rotatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
