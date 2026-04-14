import type { NextApiRequest, NextApiResponse } from "next";
import { ApiError, requireUUID } from "@/lib/api/http";
import { withIdempotentReplay } from "@/lib/api/idempotency-store";
import { nowIso } from "@/lib/api/mock-store";
import { approveAssetAndEnqueueUpload } from "@/lib/integrations/runtime";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
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
    const projectId =
      typeof body.projectId === "string" && body.projectId.trim().length > 0 ? body.projectId.trim() : "project_demo";
    const batchId = typeof body.batch_id === "string" ? requireUUID(body.batch_id.trim(), "batch_id") : undefined;

    const replay = await withIdempotentReplay(
      `approve:${assetId}`,
      idempotencyKey,
      { projectId, batchId: batchId ?? null },
      async () => {
        const handoff = await approveAssetAndEnqueueUpload({
          assetId,
          projectId,
          idempotencyKey,
          batchId,
        });

        return {
          status: 200,
          body: {
            ok: true,
            data: {
              assetId,
              projectId,
              idempotencyKey,
              status: "approved",
              approvedAt: nowIso(),
              duplicate: false,
              upload: handoff.upload,
              uploadJob: {
                id: handoff.job.id,
                status: handoff.job.status,
                traceId: handoff.job.traceId,
                queue: handoff.job.queue,
              },
            },
          },
        };
      }
    );

    res.status(replay.status).json({
      ...replay.body,
      data: {
        ...(replay.body as { data: Record<string, unknown> }).data,
        duplicate: replay.replayed,
      },
    });
  } catch (error) {
    sendError(res, error);
  }
}
