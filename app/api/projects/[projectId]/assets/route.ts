import { NextRequest } from "next/server";
import { ApiError, apiError, getSearchParam, jsonOk } from "@/lib/api/http";
import { ASSET_STATUSES } from "@/lib/api/types";
import { listAssets } from "@/lib/integrations/runtime";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 60;

function encodeCursor(payload: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      throw new Error("Invalid cursor payload");
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Query param 'cursor' must be a valid opaque token");
  }
}

function parseLimit(value: string | undefined): number {
  if (!value) return DEFAULT_PAGE_SIZE;
  const limit = Number.parseInt(value, 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Query param 'limit' must be a positive integer");
  }
  if (limit > MAX_PAGE_SIZE) {
    throw new ApiError(400, "VALIDATION_ERROR", `Query param 'limit' must be <= ${MAX_PAGE_SIZE}`);
  }
  return limit;
}

export async function GET(request: NextRequest, context: { params: { projectId: string } }) {
  try {
    const status = getSearchParam(request, "status");
    const cursor = getSearchParam(request, "cursor");
    const limit = parseLimit(getSearchParam(request, "limit"));

    if (status && !ASSET_STATUSES.includes(status as (typeof ASSET_STATUSES)[number])) {
      throw new ApiError(400, "VALIDATION_ERROR", "Query param 'status' is invalid");
    }

    const ordered = listAssets(context.params.projectId, status as (typeof ASSET_STATUSES)[number] | undefined);
    const cursorPayload = cursor ? decodeCursor(cursor) : null;
    let startIndex = 0;

    if (cursorPayload) {
      const anchorIndex = ordered.findIndex(
        (item) => item.createdAt === cursorPayload.createdAt && item.id === cursorPayload.id
      );
      if (anchorIndex < 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "Query param 'cursor' is stale or invalid");
      }
      startIndex = anchorIndex + 1;
    }

    const items = ordered.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < ordered.length;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return jsonOk({
      projectId: context.params.projectId,
      sort: "created_at_desc,id_desc",
      limit,
      items,
      feedItems: items.map((item) => ({
        id: item.id,
        previewUrl: item.thumbnailUrl,
        width: 1024,
        height: 1024,
        status: item.status,
        metadataStatus: item.metadataStatus,
        title: item.title,
        createdAt: item.createdAt,
      })),
      nextCursor,
    });
  } catch (error) {
    return apiError(error);
  }
}
