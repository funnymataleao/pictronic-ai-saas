import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk, parseJsonBody, requireArray, requireString } from "@/lib/api/http";
import { requireBearerToken } from "@/lib/bridge/http";
import { pollBridgeJob } from "@/lib/bridge/runtime";

function parseCapabilities(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;

  const items = requireArray(value, "capabilities");
  const capabilities = items.map((item, index) => {
    if (typeof item !== "string") {
      throw new ApiError(400, "VALIDATION_ERROR", `Field 'capabilities[${index}]' must be a string`);
    }
    const trimmed = item.trim();
    if (!trimmed) {
      throw new ApiError(400, "VALIDATION_ERROR", "Field 'capabilities' cannot include empty strings");
    }
    return trimmed;
  });

  return capabilities;
}

function parseOptionalMachineId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, "machineId", { max: 120 });
}

function parseOptionalLeaseTtl(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const leaseTtlSeconds = Number(value);
  if (!Number.isInteger(leaseTtlSeconds)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Field 'leaseTtlSeconds' must be an integer");
  }
  return leaseTtlSeconds;
}

export async function POST(request: NextRequest, context: { params: { nodeId: string } }) {
  const routeNodeId = requireString(context.params.nodeId, "nodeId", { max: 120 });
  const requestId = request.headers.get("x-request-id")?.trim() || "n/a";

  try {
    const connectionToken = requireBearerToken(request);
    const body: Record<string, unknown> = await parseJsonBody(request).catch(() => ({} as Record<string, unknown>));

    console.info("[bridge.poll] route-hit", {
      nodeId: routeNodeId,
      requestId,
      hasAuthorization: Boolean(request.headers.get("authorization")),
      hasFallbackToken: Boolean(request.headers.get("x-bridge-connection-token")),
    });

    const polled = pollBridgeJob({
      connectionToken,
      nodeId: routeNodeId,
      machineId: parseOptionalMachineId(body.machineId),
      capabilities: parseCapabilities(body.capabilities),
      leaseTtlSeconds: parseOptionalLeaseTtl(body.leaseTtlSeconds),
    });

    console.info("[bridge.poll] success", {
      nodeId: routeNodeId,
      requestId,
      leasedJobId: polled.job?.jobId ?? null,
    });

    return jsonOk({
      node: polled.node,
      token: {
        tokenId: polled.tokenId,
        expiresAt: polled.expiresAt,
      },
      job: polled.job,
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.warn("[bridge.poll] failed", { nodeId: routeNodeId, requestId, message });
    return apiError(error);
  }
}
