import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Игнорируем вообще всё, что похоже на файл или системный путь
  if (
    pathname.startsWith('/_next') || 
    pathname.startsWith('/api') || 
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const hasSession = !!request.cookies.get("pictronic_session")?.value;

  // Если нет сессии и лезем на приватные страницы — на главную
  if (!hasSession && (pathname.startsWith('/projects') || pathname.startsWith('/admin'))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
