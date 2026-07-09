import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getErrorLogs, clearErrorLogs, logError } from '@/lib/repositories/error_log_repo';

async function getSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return null;
  if (payload.role !== 'SUPER_ADMIN') return null;
  return payload;
}

export async function GET() {
  const payload = await getSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const logs = await getErrorLogs();
  return NextResponse.json(logs);
}

export async function DELETE() {
  const payload = await getSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await clearErrorLogs();
  return NextResponse.json({ ok: true, deleted: result.deleted });
}

export async function POST(req: Request) {
  const payload = await getSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { service?: string; level?: string; message?: string; metadata?: Record<string, unknown> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.service || !body.message)
    return NextResponse.json({ error: 'service and message are required' }, { status: 400 });

  const level = (body.level === 'warn' || body.level === 'info') ? body.level : 'error';
  await logError(body.service, level, body.message, body.metadata);
  return NextResponse.json({ ok: true });
}
