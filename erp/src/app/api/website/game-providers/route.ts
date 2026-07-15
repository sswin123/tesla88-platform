import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getAllGameProviders, createGameProvider } from '@/lib/repositories/game_provider_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

// category is now a free-form string (category_id FK is authoritative)


export async function GET() {
  try {
    const payload = await requirePermission('website.game.manage');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const providers = await getAllGameProviders();
    return NextResponse.json(providers);
  } catch (error) {
    console.error('[GET /api/website/game-providers]', error);
    return NextResponse.json(
      { error: String(error), stack: (error as Error)?.stack },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await requirePermission('website.game.manage');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: {
      provider_code?:  string;
      provider_name?:  string;
      category?:       string;
      category_id?:    number | null;
      logo_media_id?:  number | null;
      banner_media_id?: number | null;
      is_hot?:         boolean;
      is_new?:         boolean;
      is_active?:      boolean;
      display_order?:  number;
      icon_type?:      string;
      icon_emoji?:     string | null;
      icon_media_id?:  number | null;
      icon_svg?:       string | null;
    };
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    if (!body.provider_code?.trim())
      return NextResponse.json({ error: 'provider_code is required' }, { status: 400 });
    if (!body.provider_name?.trim())
      return NextResponse.json({ error: 'provider_name is required' }, { status: 400 });

    const insertData = {
      provider_code:   body.provider_code.trim(),
      provider_name:   body.provider_name.trim(),
      category:        body.category ?? 'slot',
      category_id:     body.category_id ?? null,
      logo_media_id:   body.logo_media_id ?? null,
      banner_media_id: body.banner_media_id ?? null,
      is_hot:          body.is_hot ?? false,
      is_new:          body.is_new ?? false,
      is_active:       body.is_active ?? true,
      display_order:   body.display_order ?? 0,
      icon_type:       (body.icon_type as 'none'|'emoji'|'image'|'gif'|'svg') ?? 'none',
      icon_emoji:      body.icon_emoji ?? null,
      icon_media_id:   body.icon_media_id ?? null,
      icon_svg:        body.icon_svg ?? null,
    };

    const provider = await createGameProvider(insertData);
    console.log('created provider id:', provider.id);

    try {
      await logAudit({
        admin_id:    payload.sub,
        action:      'GAME_PROVIDER_CREATE',
        target_type: 'website_game_provider',
        target_id:   provider.id,
        new_value:   { provider_code: provider.provider_code, category: provider.category },
      });
    } catch (auditErr) {
      console.warn('[POST /api/website/game-providers] audit log failed (non-fatal):', auditErr);
    }

    return NextResponse.json(provider, { status: 201 });
  } catch (error) {
    console.error('[POST /api/website/game-providers] ERROR:', error);
    return NextResponse.json(
      { error: String(error), stack: (error as Error)?.stack },
      { status: 500 }
    );
  }
}
