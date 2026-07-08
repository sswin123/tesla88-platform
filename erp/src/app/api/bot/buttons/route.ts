import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { hasMinRole } from '@/lib/permissions';
import { listBotButtons } from '@/lib/repositories/bot_messages_repo';

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

  const groupKey = request.nextUrl.searchParams.get('group') ?? undefined;
  const buttons = await listBotButtons(groupKey);
  return NextResponse.json({ buttons });
}
