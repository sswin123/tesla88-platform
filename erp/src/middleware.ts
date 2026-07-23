import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
);
const COOKIE_NAME = 'erp_session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const start = Date.now();

  const response = await handle(request, pathname);

  // 请求日志：method path status duration
  // 跳过 _next 静态资源（日志噪音大且无诊断价值）
  if (!pathname.startsWith('/_next')) {
    const status = response.status;
    const ms     = Date.now() - start;
    console.log(`[req] ${request.method} ${pathname} ${status} ${ms}ms`);
  }

  return response;
}

async function handle(request: NextRequest, pathname: string): Promise<NextResponse> {
  // Diagnostic — printed to Docker stdout, visible in: docker compose logs erp
  if (pathname.startsWith('/api/games/')) {
    console.log(`[middleware] ${request.method} ${pathname} — checking exclusions`);
  }

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

  // Lightweight container healthcheck (no DB or external calls)
  if (pathname === '/api/ping') {
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

  // Internal service-to-service game launch — called by the website, not the browser.
  // Auth is handled inside the route handler via X-Service-Secret.
  if (pathname === '/api/games/launch' && request.method === 'POST') {
    return NextResponse.next();
  }

  // 918KISS Seamless Wallet callbacks — called by 918KISS servers, not ERP users.
  // Security is handled inside each handler via operatorToken validation.
  // Nginx additionally enforces IP whitelist before this middleware runs.
  if (pathname.startsWith('/api/games/kiss918/callback/')) {
    console.log(`[middleware] PASS-THROUGH: ${pathname} — 918KISS callback, no auth required`);
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    // API routes must return JSON — never HTML redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch {
    // API routes must return JSON — never HTML redirect
    if (pathname.startsWith('/api/')) {
      const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      resp.cookies.delete(COOKIE_NAME);
      return resp;
    }
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
