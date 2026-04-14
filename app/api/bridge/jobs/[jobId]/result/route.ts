import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk, parseJsonBody, requireString } from "@/lib/api/http";
import { requireBearerToken } from "@/lib/bridge/http";
import { BridgeJobSettlementOutcome, settleBridgeJob } from "@/lib/bridge/runtime";

function parseOutcome(value: unknown): BridgeJobSettlementOutcome {
  const outcome = requireString(value, "outcome", { max: 10 }).toLowerCase();
  if (outcome === "ack" || outcome === "retry" || outcome === "fail") {
    return outcome;
  }
  throw new ApiError(400, "VALIDATION_ERROR", "Field 'outcome' must be ack|retry|fail");
}

function parseOptionalInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new ApiError(400, "VALIDATION_ERROR", `Field '${field}' must be an integer`);
  }
  return number;
}

function parseOptionalObject(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", `Field '${field}' must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseOptionalReason(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, "reason", { max: 500 });
}

export async function POST(request: NextRequest, context: { params: { jobId: string } }) {
  try {
    const connectionToken = requireBearerToken(request);
    const body = await parseJsonBody(request);

    const settled = settleBridgeJob({
      connectionToken,
      nodeId: requireString(body.nodeId, "nodeId", { max: 120 }),
      jobId: requireString(context.params.jobId, "jobId", { max: 120 }),
      leaseId: requireString(body.leaseId, "leaseId", { max: 120 }),
      outcome: parseOutcome(body.outcome),
      reason: parseOptionalReason(body.reason),
      retryDelayMs: parseOptionalInt(body.retryDelayMs, "retryDelayMs"),
      result: parseOptionalObject(body.result, "result"),
    });

    return jsonOk({ job: settled });
  } catch (error) {
    return apiError(error);
  }
}
