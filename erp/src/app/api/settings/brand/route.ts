import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import {
  getBrandSettings, updateBrandSettings, bumpBrandCacheVersion,
  VALID_LOGO_SIZES, VALID_LOGO_ALIGNS,
  type BrandUpdate,
} from '@/lib/repositories/brand_repo';
import { invalidateBrandCache } from '@/lib/brand_service';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function GET() {
  const payload = await requirePermission('brand.settings');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const brand = await getBrandSettings();
  if (!brand) return NextResponse.json({ error: 'Brand settings not found — run migration 034' }, { status: 500 });
  return NextResponse.json({ brand });
}

export async function PATCH(request: NextRequest) {
  const payload = await requirePermission('brand.settings');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: BrandUpdate;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  // Validate enum fields
  if ('logo_size' in body && !VALID_LOGO_SIZES.has((body as Record<string, unknown>).logo_size as string)) {
    return NextResponse.json(
      { error: `Invalid logo_size. Allowed: ${[...VALID_LOGO_SIZES].join(', ')}` },
      { status: 400 }
    );
  }
  if ('logo_align' in body && !VALID_LOGO_ALIGNS.has((body as Record<string, unknown>).logo_align as string)) {
    return NextResponse.json(
      { error: `Invalid logo_align. Allowed: ${[...VALID_LOGO_ALIGNS].join(', ')}` },
      { status: 400 }
    );
  }

  let oldBrand = null;
  try { oldBrand = await getBrandSettings(); } catch { /* non-critical audit snapshot */ }

  try {
    const updated = await updateBrandSettings(body, payload.username);
    invalidateBrandCache();
    bumpBrandCacheVersion().catch(() => {}); // non-blocking; bot detects on next poll

    logAudit({
      admin_id:    payload.sub,
      action:      'BRAND_SETTINGS_UPDATED',
      target_type: 'brand_settings',
      target_id:   1,
      old_value:   oldBrand as unknown as Record<string, unknown> ?? undefined,
      new_value:   updated as unknown as Record<string, unknown>,
    }).catch(() => {});

    return NextResponse.json({ ok: true, brand: updated });
  } catch (err: unknown) {
    console.error('[settings/brand PATCH]', err);
    return NextResponse.json({ error: 'Failed to update brand settings' }, { status: 500 });
  }
}
