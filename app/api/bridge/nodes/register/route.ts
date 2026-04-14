import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk, parseJsonBody, requireArray, requireString } from "@/lib/api/http";
import { requireBridgeBootstrapKey } from "@/lib/bridge/http";
import { getBridgeAuthConfig, registerNode } from "@/lib/bridge/runtime";

function parseCapabilities(value: unknown): string[] {
  if (value === undefined) {
    return [];
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

function parseOptionalNodeId(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireString(value, "nodeId", { max: 120 });
}

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

export async function POST(request: NextRequest) {
  try {
    requireBridgeBootstrapKey(request);

    const body = await parseJsonBody(request);
    const machineId = requireString(body.machineId, "machineId", { max: 120 });

    const registered = registerNode({
      nodeId: parseOptionalNodeId(body.nodeId),
      machineId,
      capabilities: parseCapabilities(body.capabilities),
      ttlSeconds: parseOptionalTtlSeconds(body.ttlSeconds),
    });

    return jsonOk({
      node: registered.node,
      connectionToken: registered.connectionToken,
      auth: getBridgeAuthConfig(),
    }, 201);
  } catch (error) {
    return apiError(error);
  }
}
