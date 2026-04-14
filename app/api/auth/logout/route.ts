import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    await supabase.auth.signOut();

    const redirectTo = new URL("/", request.url);
    const response = NextResponse.redirect(redirectTo);

    response.cookies.set("pictronic_session", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    const redirectTo = new URL("/", request.url);
    return NextResponse.redirect(redirectTo);
  }
}