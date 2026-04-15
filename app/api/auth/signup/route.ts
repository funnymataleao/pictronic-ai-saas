import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk, parseJsonBody, requireString } from "@/lib/api/http";
import { createServerClient } from "@/lib/supabase/server";
import { sanitizeNextPath, setSessionCookie } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJsonBody(request);
    const email = requireString(body.email, "email", { max: 320 });
    const password = requireString(body.password, "password", { min: 6, max: 1024 });
    const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"), "/");

    const supabase = await createServerClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${request.nextUrl.origin}/api/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });

    if (error) {
      throw new ApiError(
        400,
        "AUTH_SIGNUP_FAILED",
        "Unable to create account",
        error.message
      );
    }

    const response = jsonOk(
      {
        user: data.user
          ? {
              id: data.user.id,
              email: data.user.email ?? "",
            }
          : null,
        requiresEmailConfirmation: data.session == null,
      },
      201
    );

    if (data.session?.access_token) {
      setSessionCookie(response, data.session.access_token);
    }

    return response;
  } catch (error) {
    return apiError(error);
  }
}
