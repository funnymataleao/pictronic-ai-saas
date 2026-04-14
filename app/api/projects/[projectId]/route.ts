import { apiError, jsonOk } from "@/lib/api/http";
import { listNodeStatuses } from "@/lib/bridge/runtime";
import { listAssets, summarizeProjectAssets, summarizeQueueHealth } from "@/lib/integrations/runtime";

type SurfaceState = "empty" | "loading" | "ready" | "error";
type DependencyStatus = "online" | "offline" | "degraded";
type ReadinessStatus = "ok" | "degraded" | "failed";
const DASHBOARD_FEED_LIMIT = 24;

function encodeCursor(payload: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function projectNameFromId(projectId: string): string {
  const normalized = projectId.replace(/[-_]+/g, " ").trim();
  if (!normalized) return "Untitled project";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function summarizeSurfaceState(params: {
  imagesCount: number;
  pendingJobs: number;
  activeJobs: number;
  failedJobs: number;
  bridgeStatus: DependencyStatus;
}): SurfaceState {
  if (params.failedJobs > 0 || params.bridgeStatus === "offline") return "error";
  if (params.pendingJobs > 0 || params.activeJobs > 0) return "loading";
  if (params.imagesCount === 0) return "empty";
  return "ready";
}

export async function GET(request: Request, context: { params: { projectId: string } }) {
  try {
    const projectId = context.params.projectId;
    const summary = summarizeProjectAssets(projectId);
    const orderedAssets = listAssets(projectId);
    const assets = orderedAssets.slice(0, DASHBOARD_FEED_LIMIT);
    const hasMore = orderedAssets.length > DASHBOARD_FEED_LIMIT;
    const nextCursor = hasMore
      ? encodeCursor({
          createdAt: assets[assets.length - 1].createdAt,
          id: assets[assets.length - 1].id,
        })
      : null;
    const queue = summarizeQueueHealth();

    const onlineNodes = listNodeStatuses().filter((node) => node.status === "online");
    const bridgeNodeStatus: DependencyStatus = onlineNodes.length > 0 ? "online" : "offline";
    let bridgeRoutesStatus: DependencyStatus = "degraded";
    let runtimeStatus: ReadinessStatus = "degraded";

    try {
      const origin = new URL(request.url).origin;
      const readinessResponse = await fetch(`${origin}/api/runtime/readiness`, {
        method: "GET",
        cache: "no-store",
      });
      const readinessPayload = (await readinessResponse.json()) as {
        ok?: boolean;
        data?: {
          contract_v2?: {
            status?: ReadinessStatus;
            dependencies?: {
              bridge?: {
                status?: ReadinessStatus;
              };
            };
          };
        };
      };

      runtimeStatus = readinessPayload.data?.contract_v2?.status ?? "degraded";
      const bridgeStatus = readinessPayload.data?.contract_v2?.dependencies?.bridge?.status ?? "degraded";
      bridgeRoutesStatus =
        bridgeStatus === "ok" ? "online" : bridgeStatus === "failed" ? "offline" : "degraded";
    } catch {
      runtimeStatus = "degraded";
      bridgeRoutesStatus = "degraded";
    }

    const surfaceState = summarizeSurfaceState({
      imagesCount: summary.imagesCount,
      pendingJobs: queue.pendingJobs,
      activeJobs: queue.activeJobs,
      failedJobs: queue.failedJobs,
      bridgeStatus: bridgeNodeStatus,
    });

    const stateReasonCode =
      surfaceState === "error"
        ? bridgeNodeStatus === "offline"
          ? "BRIDGE_NODE_UNAVAILABLE"
          : "TRANSIENT_FAILURE"
        : surfaceState === "loading"
          ? "QUEUE_ACTIVE"
          : surfaceState === "empty"
            ? "EMPTY_DATASET"
            : "READY";

    return jsonOk({
      project: {
        id: projectId,
        name: projectNameFromId(projectId),
        imagesCount: summary.imagesCount,
        approvedCount: summary.approvedCount,
        thumbnailUrls: summary.thumbnailUrls,
        createdAt: summary.latestAssetAt ?? new Date().toISOString(),
      },
      generationQueue: {
        pendingJobs: queue.pendingJobs,
        activeJobs: queue.activeJobs,
        completedJobs: queue.completedJobs,
        failedJobs: queue.failedJobs,
        totalJobs: queue.totalJobs,
      },
      masonryFeed: {
        projectId,
        sort: "created_at_desc,id_desc",
        limit: DASHBOARD_FEED_LIMIT,
        items: assets.map((asset) => ({
          id: asset.id,
          previewUrl: asset.thumbnailUrl,
          width: 1024,
          height: 1024,
          status: asset.status,
          metadataStatus: asset.metadataStatus,
          title: asset.title,
          createdAt: asset.createdAt,
        })),
        nextCursor,
      },
      runtimeBridgeBadge: {
        runtimeStatus,
        bridgeRoutesStatus,
        bridgeNodeStatus,
        onlineNodeCount: onlineNodes.length,
        checkedAt: new Date().toISOString(),
      },
      surfaceState,
      stateReasonCode,
    });
  } catch (error) {
    return apiError(error);
  }
}
