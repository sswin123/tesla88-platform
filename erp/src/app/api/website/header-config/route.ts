import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/require_permission';
import { getSetting, setSettings } from '@/lib/repositories/settings_repo';

const KEY = 'header_config';
const HEADER_CONFIG_VERSION = 1 as const;

// Write-side schema — validates incoming config before persisting to system_settings.
const HeaderConfigWriteSchema = z.object({
  _version: z.number().int().min(1).optional(),
  layout: z.enum(['left-logo', 'center-logo', 'right-logo']),
  style: z.string(),
  sticky: z.boolean(),
  blur: z.boolean(),
  show_menu_button: z.boolean(),
  show_announcement: z.boolean(),
  show_logo: z.boolean(),
  show_brand_text: z.boolean(),
  show_profile_widget: z.boolean().optional(),
  show_header_widgets: z.boolean().optional(),
  widgets: z.array(z.object({
    id: z.string(),
    type: z.enum(['social', 'button', 'language', 'partner', 'profile', 'divider']),
    enabled: z.boolean(),
    visibility: z.enum(['both', 'desktop', 'mobile']),
    settings: z.record(z.string(), z.unknown()),
  })),
});

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
  const parsed = HeaderConfigWriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid header config structure' }, { status: 400 });
  }

  const configToSave = { ...parsed.data, _version: HEADER_CONFIG_VERSION };
  await setSettings({ [KEY]: JSON.stringify(configToSave) }, payload.username ?? 'admin');
  return NextResponse.json({ ok: true });
}
