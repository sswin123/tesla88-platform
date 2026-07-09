import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getAllGameProviders, createGameProvider } from '@/lib/repositories/game_provider_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

const VALID_CATEGORIES = ['slot', 'live', 'sport', 'fishing'] as const;

export async function GET() {
  const payload = await requirePermission('website.game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const providers = await getAllGameProviders();
  return NextResponse.json(providers);
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('website.game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    provider_code?: string;
    provider_name?: string;
    category?: string;
    logo_media_id?: number | null;
    banner_media_id?: number | null;
    is_hot?: boolean;
    is_new?: boolean;
    is_active?: boolean;
    display_order?: number;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.provider_code?.trim())
    return NextResponse.json({ error: 'provider_code is required' }, { status: 400 });
  if (!body.provider_name?.trim())
    return NextResponse.json({ error: 'provider_name is required' }, { status: 400 });

  const category = (VALID_CATEGORIES as readonly string[]).includes(body.category ?? '')
    ? (body.category as typeof VALID_CATEGORIES[number])
    : 'slot';

  const provider = await createGameProvider({
    provider_code:  body.provider_code.trim(),
    provider_name:  body.provider_name.trim(),
    category,
    logo_media_id:   body.logo_media_id ?? null,
    banner_media_id: body.banner_media_id ?? null,
    is_hot:          body.is_hot ?? false,
    is_new:          body.is_new ?? false,
    is_active:       body.is_active ?? true,
    display_order:   body.display_order ?? 0,
  });

  await logAudit({
    admin_id:    payload.sub,
    action:      'GAME_PROVIDER_CREATE',
    target_type: 'website_game_provider',
    target_id:   provider.id,
    new_value:   { provider_code: provider.provider_code, category: provider.category },
  });

  return NextResponse.json(provider, { status: 201 });
}
