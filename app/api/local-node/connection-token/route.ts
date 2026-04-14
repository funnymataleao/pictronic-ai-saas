import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk, parseJsonBody, requireString } from "@/lib/api/http";
import { listNodeStatuses, registerNode, rotateConnectionToken } from "@/lib/bridge/runtime";

function parseOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = requireString(value, field, { max: 120 }).trim();
  if (!normalized) {
    throw new ApiError(400, "VALIDATION_ERROR", `Field '${field}' cannot be empty`);
  }

  return normalized;
}

function parseOptionalCapabilities(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiError(400, "VALIDATION_ERROR", "Field 'capabilities' must be an array of strings");
  }

  const capabilities = value.map((item) => item.trim()).filter(Boolean);
  return capabilities.length > 0 ? capabilities : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body: Record<string, unknown> = await parseJsonBody(request).catch(
      () => ({} as Record<string, unknown>)
    );

    const requestedNodeId = parseOptionalString(body.nodeId, "nodeId");
    const machineId = parseOptionalString(body.machineId, "machineId") ?? "pictronic-local-node";
    const capabilities = parseOptionalCapabilities(body.capabilities) ?? ["comfyui", "ollama"];

    if (requestedNodeId) {
      const rotated = rotateConnectionToken({ nodeId: requestedNodeId });
      return jsonOk({
        mode: "rotated",
        node: rotated.node,
        connectionToken: rotated.connectionToken,
        issuedAt: new Date().toISOString(),
      });
    }

    const knownNodes = listNodeStatuses();
    if (knownNodes.length > 0) {
      const rotated = rotateConnectionToken({ nodeId: knownNodes[0].nodeId });
      return jsonOk({
        mode: "rotated",
        node: rotated.node,
        connectionToken: rotated.connectionToken,
        issuedAt: new Date().toISOString(),
      });
    }

    const registered = registerNode({
      machineId,
      capabilities,
    });

    return jsonOk(
      {
        mode: "registered",
        node: registered.node,
        connectionToken: registered.connectionToken,
        issuedAt: new Date().toISOString(),
      },
      201
    );
  } catch (error) {
    return apiError(error);
  }
}
