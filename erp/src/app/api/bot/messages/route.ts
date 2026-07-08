import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { hasMinRole } from '@/lib/permissions';
import { listBotMessages } from '@/lib/repositories/bot_messages_repo';

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload || !hasMinRole(payload.role, 'ADMIN')) return null;
  return payload;
}

export async function GET(request: NextRequest) {
  const payload = await requireAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') ?? undefined;
  const language = searchParams.get('language') ?? undefined;
  const search   = searchParams.get('search')   ?? undefined;

  const messages = await listBotMessages({ category, language, search });
  return NextResponse.json({ messages });
}
