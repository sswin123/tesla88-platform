import { NextRequest, NextResponse } from 'next/server';
import { verifyMemberJWT, COOKIE_NAME } from '@/lib/auth';

const PROTECTED = ['/chat', '/history', '/deposit', '/withdraw', '/profile', '/dashboard'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await verifyMemberJWT(token);
    return NextResponse.next();
  } catch {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/chat', '/history', '/deposit', '/withdraw', '/profile', '/dashboard'],
};
