import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk, parseJsonBody, requireArray, requireString } from "@/lib/api/http";
import { requireBearerToken } from "@/lib/bridge/http";
import { acceptHeartbeat } from "@/lib/bridge/runtime";

function parseCapabilities(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const items = requireArray(value, "capabilities");
  const capabilities = items.map((item, index) => {
    if (typeof item !== "string") {
      throw new ApiError(400, "VALIDATION_ERROR", `Field 'capabilities[${index}]' must be a string`);
    }
    return item.trim();
  });

  if (capabilities.some((item) => item.length === 0)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Field 'capabilities' cannot include empty strings");
  }

  return capabilities;
}

function parseOptionalMachineId(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireString(value, "machineId", { max: 120 });
}

export async function POST(request: NextRequest, context: { params: { nodeId: string } }) {
  try {
    const connectionToken = requireBearerToken(request);
    const body: Record<string, unknown> = await parseJsonBody(request).catch(
      () => ({} as Record<string, unknown>)
    );

    const heartbeat = acceptHeartbeat({
      connectionToken,
      nodeId: requireString(context.params.nodeId, "nodeId", { max: 120 }),
      machineId: parseOptionalMachineId(body.machineId),
      capabilities: parseCapabilities(body.capabilities),
    });

    return jsonOk({
      node: heartbeat.node,
      token: {
        tokenId: heartbeat.tokenId,
        expiresAt: heartbeat.expiresAt,
      },
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
