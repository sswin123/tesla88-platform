import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSetting, setSettings } from '@/lib/repositories/settings_repo';

const KEY = 'header_config';

export async function GET() {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await getSetting(KEY);
  if (!raw) return NextResponse.json(null);

  try {
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json(null);
  }
}

export async function PUT(req: NextRequest) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as unknown;
  await setSettings({ [KEY]: JSON.stringify(body) }, payload.username ?? 'admin');
  return NextResponse.json({ ok: true });
}
