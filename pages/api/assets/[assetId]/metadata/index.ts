import type { NextApiRequest, NextApiResponse } from "next";
import { ApiError, requireString } from "@/lib/api/http";
import { updateAssetMetadata } from "@/lib/integrations/runtime";

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

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", `Field '${field}' must be an array`);
  }
  return value;
}

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed", details: null } });
    return;
  }

  const assetId = Array.isArray(req.query.assetId) ? req.query.assetId[0] : req.query.assetId;
  if (!assetId) {
    res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Missing assetId", details: null } });
    return;
  }

  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "INVALID_BODY", "JSON body must be an object");
    }

    const payload = body as Record<string, unknown>;
    const title = requireString(payload.title, "title", { max: 220 });
    const tags = requireArray(payload.tags, "tags").map((tag) => requireString(tag, "tags[]", { max: 64 }));

    const updated = updateAssetMetadata(assetId, { title, tags });
    if (!updated) {
      throw new ApiError(404, "NOT_FOUND", "Asset not found");
    }

    res.status(200).json({
      ok: true,
      data: {
        assetId: updated.id,
        title: updated.title,
        tags: updated.tags,
        metadataStatus: updated.metadataStatus,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    sendError(res, error);
  }
}
