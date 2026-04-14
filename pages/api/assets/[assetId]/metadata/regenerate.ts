import type { NextApiRequest, NextApiResponse } from "next";
import { ApiError, requireString } from "@/lib/api/http";
import { fakeId, nowIso } from "@/lib/api/mock-store";
import { regenerateAssetMetadata } from "@/lib/integrations/runtime";

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

function requireIdempotencyKey(req: NextApiRequest): string {
  const raw = req.headers["idempotency-key"];
  const key = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!key) {
    throw new ApiError(400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required for this endpoint");
  }
  if (key.length > 128) {
    throw new ApiError(400, "VALIDATION_ERROR", "Idempotency-Key must be <= 128 chars");
  }
  return key;
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
    const idempotencyKey = requireIdempotencyKey(req);
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
    const mode = requireString(body.mode ?? "both", "mode", { max: 32 });

    if (!(["title", "tags", "both"] as const).includes(mode as "title" | "tags" | "both")) {
      throw new ApiError(400, "VALIDATION_ERROR", "Field 'mode' must be one of: title, tags, both");
    }

    const updated = regenerateAssetMetadata(assetId, mode as "title" | "tags" | "both");
    if (!updated) {
      throw new ApiError(404, "NOT_FOUND", "Asset not found");
    }

    res.status(202).json({
      ok: true,
      data: {
        assetId,
        idempotencyKey,
        acceptedAt: nowIso(),
        metadataStatus: updated.metadataStatus,
        title: updated.title,
        tags: updated.tags,
        job: {
          id: fakeId("job"),
          type: "metadata",
          status: "pending",
          mode,
        },
      },
    });
  } catch (error) {
    sendError(res, error);
  }
}
