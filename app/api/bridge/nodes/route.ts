import { NextRequest } from "next/server";
import { apiError, jsonOk } from "@/lib/api/http";
import { requireBridgeAdminKey } from "@/lib/bridge/http";
import { listNodeStatuses } from "@/lib/bridge/runtime";

export async function GET(request: NextRequest) {
  try {
    requireBridgeAdminKey(request);

    const nodes = listNodeStatuses();
    return jsonOk({
      items: nodes,
      total: nodes.length,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
