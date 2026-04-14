import { apiError, jsonOk } from "@/lib/api/http";
import { listNodeStatuses } from "@/lib/bridge/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = listNodeStatuses();
    return jsonOk({
      items,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
