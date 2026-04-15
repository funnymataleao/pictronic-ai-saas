import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sanitizeNextPath, setSessionCookie } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const next = sanitizeNextPath(requestUrl.searchParams.get("next"), "/");

    if (code) {
      const supabase = await createServerClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        const redirectUrl = new URL(next, request.url);
        const response = NextResponse.redirect(redirectUrl);
        const accessToken = data.session?.access_token;
        if (accessToken) {
          setSessionCookie(response, accessToken);
        }
        return response;
      }
    }

    return NextResponse.redirect(new URL(`/?error=auth_failed&next=${encodeURIComponent(next)}`, request.url));
  } catch {
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }
}
