import { NextRequest, NextResponse } from 'next/server';
import { verifyMemberJWT, COOKIE_NAME, BANK_COOKIE_NAME } from '@/lib/auth';

// Routes that are completely public — no auth, no bank check
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/download',
  '/offline',
];

// Routes that require login but are exempt from the bank completion check
// (so the user can reach the bank form even without completing it yet)
const BANK_EXEMPT_PATHS = [
  '/complete-bank-information',
];

// Routes that require authentication (guests are redirected to /login)
const AUTH_REQUIRED_PATHS = [
  '/deposit',
  '/withdraw',
  '/profile',
  '/history',
  '/dashboard',
  '/promotions',
  '/complete-bank-information',
];

function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some(p => pathname === p || pathname.startsWith(p + '/'));
}

function isStaticOrApi(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/robots.txt'
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Pass through static files and API routes immediately
  if (isStaticOrApi(pathname)) return NextResponse.next();

  // Partner landing pages (/p/*): bypass casino chrome — set header so
  // root layout.tsx renders a bare <html><body> instead of CasinoHeader etc.
  if (pathname.startsWith('/p/')) {
    const res = NextResponse.next();
    res.headers.set('x-is-partner-page', '1');
    return res;
  }

  // Pass through fully public pages (no auth needed)
  if (matchesPath(pathname, PUBLIC_PATHS)) return NextResponse.next();

  const authToken = req.cookies.get(COOKIE_NAME)?.value;

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!authToken) {
    if (matchesPath(pathname, AUTH_REQUIRED_PATHS)) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Public pages (homepage, chat, etc.) — guests can view
    return NextResponse.next();
  }

  // ── Logged in — verify JWT ────────────────────────────────────────────────
  try {
    await verifyMemberJWT(authToken);
  } catch {
    // Invalid/expired token — redirect to login
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
    res.cookies.set(BANK_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return res;
  }

  // ── Bank completion check ─────────────────────────────────────────────────
  // Allow the bank form page itself to load (otherwise infinite redirect loop)
  if (matchesPath(pathname, BANK_EXEMPT_PATHS)) {
    return NextResponse.next();
  }

  const bankOk = req.cookies.get(BANK_COOKIE_NAME)?.value;
  if (!bankOk) {
    // Member is logged in but has not completed bank information
    const bankUrl = req.nextUrl.clone();
    bankUrl.pathname = '/complete-bank-information';
    return NextResponse.redirect(bankUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next.js internals and static assets.
     * API routes are excluded because they handle their own auth.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|api/|sw\\.js|robots\\.txt|manifest\\.json).*)',
  ],
};
