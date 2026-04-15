import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk } from "@/lib/api/http";
import { createServerClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const safeNext = sanitizeNextPath(request.nextUrl.searchParams.get("next"), "/");

    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${request.nextUrl.origin}/api/auth/callback?next=${encodeURIComponent(safeNext)}`,
      },
    });

    if (error || !data.url) {
      throw new ApiError(400, "AUTH_OAUTH_START_FAILED", "Unable to start Google sign-in", error?.message ?? null);
    }

    return jsonOk({ url: data.url });
  } catch (error) {
    return apiError(error);
  }
}
