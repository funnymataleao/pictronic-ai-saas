import { NextRequest } from "next/server";
import { ApiError, apiError, jsonOk, parseJsonBody, requireString } from "@/lib/api/http";
import { createServerClient } from "@/lib/supabase/server";
import { setSessionCookie } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJsonBody(request);
    const email = requireString(body.email, "email", { max: 320 });
    const password = requireString(body.password, "password", { min: 6, max: 1024 });

    const supabase = await createServerClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user || !data.session?.access_token) {
      throw new ApiError(
        401,
        "AUTH_INVALID_CREDENTIALS",
        "Invalid email or password",
        error?.message ?? null
      );
    }

    const response = jsonOk({
      authenticated: true,
      user: {
        id: data.user.id,
        email: data.user.email ?? "",
      },
    });
    setSessionCookie(response, data.session.access_token);

    return response;
  } catch (error) {
    return apiError(error);
  }
}
