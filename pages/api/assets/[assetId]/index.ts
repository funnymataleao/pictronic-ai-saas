import type { NextApiRequest, NextApiResponse } from "next";
import { ApiError } from "@/lib/api/http";
import { assetStub } from "@/lib/api/mock-store";
import { getAsset } from "@/lib/integrations/runtime";

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
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed", details: null } });
    return;
  }

  const assetId = Array.isArray(req.query.assetId) ? req.query.assetId[0] : req.query.assetId;
  if (!assetId) {
    res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Missing assetId", details: null } });
    return;
  }

  try {
    const asset = getAsset(assetId);
    if (asset) {
      res.status(200).json({
        ok: true,
        data: {
          ...asset,
          metadata: {
            title: asset.title,
            tags: asset.tags,
          },
        },
      });
      return;
    }

    res.status(200).json({
      ok: true,
      data: {
        ...assetStub("project_demo"),
        id: assetId,
        metadata: {
          title: "Minimalist office with warm daylight",
          tags: ["office", "minimal", "business", "workspace"],
        },
      },
    });
  } catch (error) {
    sendError(res, error);
  }
}
