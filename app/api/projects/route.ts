import { NextRequest } from "next/server";
import { apiError, asOptionalString, jsonOk, parseJsonBody, requireString } from "@/lib/api/http";
import { requireAuth } from "@/lib/api/auth";
import { fakeId, nowIso } from "@/lib/api/mock-store";
import { listProjectIds, summarizeProjectAssets } from "@/lib/integrations/runtime";

function projectNameFromId(projectId: string): string {
  const normalized = projectId.replace(/[-_]+/g, " ").trim();
  if (!normalized) return "Untitled project";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function GET() {
  try {
    await requireAuth();
    const projectIds = listProjectIds();

    return jsonOk({
      items: projectIds.map((projectId) => {
        const summary = summarizeProjectAssets(projectId);
        return {
          id: projectId,
          name: projectNameFromId(projectId),
          imagesCount: summary.imagesCount,
          approvedCount: summary.approvedCount,
          thumbnailUrls: summary.thumbnailUrls,
          createdAt: summary.latestAssetAt ?? nowIso(),
        };
      }),
      nextCursor: null,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await parseJsonBody(request);
    const name = requireString(body.name, "name", { max: 160 });

    return jsonOk(
      {
        id: fakeId("proj"),
        name,
        promptTemplate: asOptionalString(body.promptTemplate, "promptTemplate", 2000) ?? "",
        styleHints: asOptionalString(body.styleHints, "styleHints", 1000) ?? "",
        tagsHints: asOptionalString(body.tagsHints, "tagsHints", 1000) ?? "",
        providerDefault: asOptionalString(body.providerDefault, "providerDefault", 40) ?? "local",
        uploadDefaults: body.uploadDefaults ?? {},
        createdAt: nowIso(),
      },
      201
    );
  } catch (error) {
    return apiError(error);
  }
}
