import { createServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError } from "./http";

export const SESSION_COOKIE_NAME = "pictronic_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface AuthContext {
  userId: string;
  email: string;
}

export function sanitizeNextPath(input: string | null | undefined, fallback = "/"): string {
  if (!input || !input.startsWith("/") || input.startsWith("//")) {
    return fallback;
  }
  return input;
}

export function setSessionCookie(response: NextResponse, accessToken: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function requireAuth(): Promise<AuthContext> {
  const cookieStore = cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
  }

  const supabase = await createServerClient();
  
  const { data: { user }, error } = await supabase.auth.getUser(sessionToken);

  if (error || !user) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired session");
  }

  return {
    userId: user.id,
    email: user.email ?? "",
  };
}

export async function optionalAuth(): Promise<AuthContext | null> {
  try {
    return await requireAuth();
  } catch {
    return null;
  }
}

export async function getAuthContext(): Promise<AuthContext | null> {
  return optionalAuth();
}
