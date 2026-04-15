import { NextRequest } from "next/server";
import { apiError, parseJsonBody, requireString } from "@/lib/api/http";
import { requireAuth } from "@/lib/api/auth";

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await parseJsonBody(request);
    const host = requireString(body.ftpHost, "ftpHost", { max: 255 });
    requireString(body.ftpLogin, "ftpLogin", { max: 128 });
    requireString(body.ftpPassword, "ftpPassword", { max: 255 });

    return Response.json({
      ok: true,
      data: {
        provider: "adobe",
        host,
        connectionStatus: "ok",
        message: "FTP credentials format accepted (connectivity probe is stubbed in scaffold)",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
