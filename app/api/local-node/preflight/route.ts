import { apiError, jsonOk } from "@/lib/api/http";
import { runLocalPreflight } from "@/lib/local-node/preflight";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await runLocalPreflight();
    const status = report.preflight === "ok" ? 200 : 503;
    return jsonOk(report, status);
  } catch (error) {
    return apiError(error);
  }
}
