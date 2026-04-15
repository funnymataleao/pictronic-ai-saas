import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { clearSessionCookie } from "@/lib/api/auth";
import { jsonOk } from "@/lib/api/http";

export const dynamic = "force-dynamic";

async function performLogout() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
}

async function handleLogoutRedirect(request: Request) {
  try {
    await performLogout();
    const redirectTo = new URL("/", request.url);
    const response = NextResponse.redirect(redirectTo);
    clearSessionCookie(response);
    return response;
  } catch {
    const redirectTo = new URL("/", request.url);
    const response = NextResponse.redirect(redirectTo);
    clearSessionCookie(response);
    return response;
  }
}

async function handleLogoutJson() {
  try {
    await performLogout();
  } catch {
  }

  const response = jsonOk({
    loggedOut: true,
  });
  clearSessionCookie(response);
  return response;
}

export async function GET(request: Request) {
  return handleLogoutRedirect(request);
}

export async function POST() {
  return handleLogoutJson();
}
