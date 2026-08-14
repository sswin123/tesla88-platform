import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/require_permission';
import { getSetting, setSettings } from '@/lib/repositories/settings_repo';

const KEY = 'nav_config';

const NavItemSchema: z.ZodType<{
  id: string;
  label: string;
  icon?: string;
  url: string;
  open: 'same' | 'new';
  children?: unknown[];
}> = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  url: z.string(),
  open: z.enum(['same', 'new']),
  children: z.array(z.lazy(() => NavItemSchema)).optional(),
});

const NavConfigSchema = z.object({
  items: z.array(NavItemSchema),
});

export async function GET() {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await getSetting(KEY);
  if (!raw) return NextResponse.json({ items: [] });

  try {
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ items: [] });
  }
}

export async function PUT(req: NextRequest) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as unknown;
  const parsed = NavConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid nav config', details: parsed.error.flatten() }, { status: 400 });
  }

  await setSettings({ [KEY]: JSON.stringify(parsed.data) }, payload.username ?? 'admin');
  return NextResponse.json({ ok: true });
}
