import { getAllTags, createTag } from '@/lib/repositories/support_repo';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const tags = await getAllTags();
  return NextResponse.json(tags);
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { name?: string; color?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const tag = await createTag({ name: body.name.trim(), color: body.color ?? '#6B7280' });
  return NextResponse.json(tag, { status: 201 });
}
