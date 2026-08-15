import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getSetting, setSettings } from '@/lib/repositories/settings_repo';
import { logAudit } from '@/lib/repositories/audit_repo';
import { FooterConfigWriteSchema, FOOTER_CONFIG_VERSION } from '@/lib/footer-config-schema';

const DRAFT_KEY = 'footer_config_draft';
const LIVE_KEY  = 'footer_config';

// POST = "Publish". Copies the current draft (footer_config_draft) onto the
// live key (footer_config) that the public website actually reads. There is
// no separate cache/ISR layer to bust for footer config (the public API is
// force-dynamic / no-store), so writing this key is itself the full publish
// — the very next website request sees the new footer immediately.
export async function POST() {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draftRaw = await getSetting(DRAFT_KEY);
  if (!draftRaw) {
    return NextResponse.json({ error: 'No draft to publish. Save changes first.' }, { status: 400 });
  }

  let draftJson: unknown;
  try {
    draftJson = JSON.parse(draftRaw);
  } catch {
    return NextResponse.json({ error: 'Draft is corrupted and cannot be published.' }, { status: 400 });
  }

  const parsed = FooterConfigWriteSchema.safeParse(draftJson);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Draft failed validation and cannot be published.', details: parsed.error.flatten() }, { status: 400 });
  }

  const publishedConfig = {
    ...parsed.data,
    _version: FOOTER_CONFIG_VERSION,
    published_at: new Date().toISOString(),
    published_by: payload.username ?? 'admin',
  };

  await setSettings({ [LIVE_KEY]: JSON.stringify(publishedConfig) }, payload.username ?? 'admin');

  await logAudit({
    admin_id: payload.sub,
    action: 'FOOTER_CONFIG_PUBLISH',
    target_type: 'footer_config',
    target_id: null,
    new_value: { item_count: parsed.data.items.length },
  });

  return NextResponse.json({ ok: true, config: publishedConfig });
}
