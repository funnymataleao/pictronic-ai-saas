import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/projects", "/admin"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isSystemPath = pathname.startsWith("/_next") || pathname.startsWith("/api");
  const isStaticAsset = pathname.includes(".");

  if (isSystemPath || isStaticAsset) {
    return NextResponse.next();
  }

  const hasSession = !!request.cookies.get("pictronic_session")?.value;
  const isProtectedPath = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!hasSession && isProtectedPath) {
    const destination = new URL("/", request.url);
    destination.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(destination);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
