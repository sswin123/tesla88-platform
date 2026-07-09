import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
);
const COOKIE_NAME = 'erp_session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — no auth required
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Allow unauthenticated GET access to /api/providers (needed by the bot)
  if (pathname === '/api/providers' && request.method === 'GET') {
    return NextResponse.next();
  }

  // Allow unauthenticated access to public maintenance endpoints (no sensitive data)
  if (pathname === '/api/maintenance/status' || pathname === '/api/maintenance/health') {
    return NextResponse.next();
  }

  // Public health API for external uptime monitoring (no sensitive data)
  if (pathname === '/api/health/system') {
    return NextResponse.next();
  }

  // Public brand data consumed by the website and bot (read-only, no sensitive data)
  if (pathname.startsWith('/api/public/')) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
