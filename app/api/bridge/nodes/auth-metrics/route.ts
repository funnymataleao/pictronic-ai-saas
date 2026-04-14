import { NextRequest } from "next/server";
import { apiError, jsonOk } from "@/lib/api/http";
import { requireBridgeAdminKey } from "@/lib/bridge/http";
import { getBridgeAuthDecisionCounters } from "@/lib/bridge/runtime";

export async function GET(request: NextRequest) {
  try {
    requireBridgeAdminKey(request);
    return jsonOk({
      counters: getBridgeAuthDecisionCounters(),
      capturedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
