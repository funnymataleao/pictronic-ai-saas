import { NextRequest } from "next/server";
import { apiError, parseJsonBody, requireString } from "@/lib/api/http";
import { requireAuth } from "@/lib/api/auth";
import { fakeId, nowIso } from "@/lib/api/mock-store";

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await parseJsonBody(request);
    const ftpHost = requireString(body.ftpHost, "ftpHost", { max: 255 });
    const ftpLogin = requireString(body.ftpLogin, "ftpLogin", { max: 128 });
    requireString(body.ftpPassword, "ftpPassword", { max: 255 });

    return Response.json(
      {
        ok: true,
        data: {
          id: fakeId("stock_conn"),
          provider: "adobe",
          ftpHost,
          ftpLogin,
          isActive: true,
          createdAt: nowIso(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
