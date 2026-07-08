import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getBrandSettings, updateBrandSettings, type BrandUpdate } from '@/lib/repositories/brand_repo';
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

  const oldBrand = await getBrandSettings();

  try {
    const updated = await updateBrandSettings(body, payload.username);
    invalidateBrandCache();

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
