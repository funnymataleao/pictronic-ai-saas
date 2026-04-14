import type { NextApiRequest, NextApiResponse } from "next";
import { ApiError } from "@/lib/api/http";
import { nowIso } from "@/lib/api/mock-store";

function sendError(res: NextApiResponse, error: unknown): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
    });
    return;
  }

  res.status(500).json({
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Unexpected server error",
      details: null,
    },
  });
}

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed", details: null } });
    return;
  }

  const assetId = Array.isArray(req.query.assetId) ? req.query.assetId[0] : req.query.assetId;
  if (!assetId) {
    res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Missing assetId", details: null } });
    return;
  }

  try {
    res.status(202).json({
      ok: true,
      data: {
        assetId,
        status: "deleted",
        deletedAt: nowIso(),
      },
    });
  } catch (error) {
    sendError(res, error);
  }
}
