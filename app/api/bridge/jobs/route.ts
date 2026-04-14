import { NextRequest } from "next/server";
import { ApiError, apiError, getSearchParam, jsonOk, parseJsonBody, requireString } from "@/lib/api/http";
import { requireBridgeAdminKey } from "@/lib/bridge/http";
import { BridgeJobStatus, enqueueBridgeJob, listBridgeJobs } from "@/lib/bridge/runtime";

function parseOptionalInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new ApiError(400, "VALIDATION_ERROR", `Field '${field}' must be an integer`);
  }
  return number;
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Field 'payload' must be an object");
  }
  return value as Record<string, unknown>;
}

function parseStatus(value: string | undefined): BridgeJobStatus | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === "queued" || normalized === "leased" || normalized === "completed" || normalized === "failed") {
    return normalized;
  }

  throw new ApiError(400, "VALIDATION_ERROR", "Query param 'status' must be queued|leased|completed|failed");
}

export async function GET(request: NextRequest) {
  try {
    requireBridgeAdminKey(request);
    const status = parseStatus(getSearchParam(request, "status"));

    return jsonOk({
      items: listBridgeJobs(status),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireBridgeAdminKey(request);
    const body = await parseJsonBody(request);

    const kind = requireString(body.kind, "kind", { max: 100 });
    const payload = parsePayload(body.payload);

    const job = enqueueBridgeJob({
      kind,
      payload,
      maxAttempts: parseOptionalInt(body.maxAttempts, "maxAttempts"),
      backoffMs: parseOptionalInt(body.backoffMs, "backoffMs"),
    });

    return jsonOk({ job }, 201);
  } catch (error) {
    return apiError(error);
  }
}
