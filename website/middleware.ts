import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET   = new TextEncoder().encode(process.env.MEMBER_JWT_SECRET ?? 'member-dev-secret-change-in-production');
const PROTECTED = ['/dashboard', '/profile', '/deposit', '/withdrawal', '/chat', '/history'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some(p => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get('member_session')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', req.url));

  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete('member_session');
    return res;
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/profile/:path*', '/deposit/:path*', '/withdrawal/:path*', '/chat/:path*', '/history/:path*'],
};
