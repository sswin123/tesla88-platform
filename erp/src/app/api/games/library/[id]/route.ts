import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/games/library/[id]
 * Update any field on a gp_games record.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const gameId = parseInt(id, 10);
  if (isNaN(gameId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json() as Record<string, unknown>;

  const ALLOWED_FIELDS: Record<string, string> = {
    name:             'name',
    display_name:     'display_name',
    description:      'description',
    category:         'category',
    subcategory:      'subcategory',
    launch_mode:      'launch_mode',
    import_mode:      'import_mode',
    icon_url:         'icon_url',
    thumbnail_url:    'thumbnail_url',
    banner_url:       'banner_url',
    visible:          'visible',
    featured:         'featured',
    recommended:      'recommended',
    is_active:        'is_active',
    is_hot:           'is_hot',
    is_new:           'is_new',
    is_maintenance:   'is_maintenance',
    desktop_supported:'desktop_supported',
    mobile_supported: 'mobile_supported',
    sort_order:       'sort_order',
    metadata:         'metadata',
  };

  const VALID_LAUNCH_MODES = ['LOBBY','DIRECT','EXTERNAL','DOWNLOAD','COMING_SOON'];
  if (body.launch_mode && !VALID_LAUNCH_MODES.includes(body.launch_mode as string)) {
    return NextResponse.json({ error: `Invalid launch_mode. Allowed: ${VALID_LAUNCH_MODES.join(', ')}` }, { status: 400 });
  }

  const sets: string[] = [];
  const vals: unknown[] = [gameId];
  let i = 2;

  for (const [key, col] of Object.entries(ALLOWED_FIELDS)) {
    if (key in body) {
      const val = key === 'metadata' ? JSON.stringify(body[key]) : body[key];
      sets.push(`${col} = $${i++}`);
      vals.push(val);
    }
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });

  sets.push('updated_at = NOW()');
  const { rowCount } = await pool.query(
    `UPDATE gp_games SET ${sets.join(', ')} WHERE id = $1`,
    vals,
  );

  if (!rowCount) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/games/library/[id]
 * Hard-delete a game (only MANUAL games should be deleted; API games reappear on next sync).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const gameId = parseInt(id, 10);
  if (isNaN(gameId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rowCount } = await pool.query('DELETE FROM gp_games WHERE id = $1', [gameId]);
  if (!rowCount) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
