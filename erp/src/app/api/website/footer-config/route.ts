import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSetting, setSettings } from '@/lib/repositories/settings_repo';
import { FooterConfigWriteSchema, FOOTER_CONFIG_VERSION } from '@/lib/footer-config-schema';

const DRAFT_KEY = 'footer_config_draft';
const LIVE_KEY  = 'footer_config';

// GET returns the current draft for the ERP editor to resume from. Falls
// back to the published config if no draft has ever been saved (e.g. right
// after a fresh Publish with no further edits), and to null if neither key
// exists yet (brand-new site — the ERP page renders its own default config).
export async function GET() {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draftRaw = await getSetting(DRAFT_KEY);
  const raw = draftRaw ?? await getSetting(LIVE_KEY);
  if (!raw) return NextResponse.json(null);

  try {
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json(null);
  }
}

// PUT = "Save". Only ever writes footer_config_draft — never touches the
// published footer_config key, so saving never affects the live website.
export async function PUT(req: NextRequest) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as unknown;
  const parsed = FooterConfigWriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid footer config structure', details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.items.length > 6) {
    return NextResponse.json({ error: 'Maximum 6 footer items allowed.' }, { status: 400 });
  }

  const configToSave = { ...parsed.data, _version: FOOTER_CONFIG_VERSION };
  await setSettings({ [DRAFT_KEY]: JSON.stringify(configToSave) }, payload.username ?? 'admin');
  return NextResponse.json({ ok: true });
}
