import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import type { WebsiteGameCategory } from '@/lib/types';

const VALID_ICON_TYPES = ['none', 'emoji', 'image', 'gif', 'svg'] as const;

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/website/lobby-categories/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const payload = await requirePermission('website.builder.manage');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const catId = parseInt(id);
    if (isNaN(catId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    const allowed = [
      'category_name', 'display_order', 'is_active',
      'icon_emoji', 'icon_media_id', 'icon_svg',
    ] as const;

    for (const key of allowed) {
      if (key in body) {
        fields.push(`${key} = $${i++}`);
        values.push(body[key] ?? null);
      }
    }

    if ('icon_type' in body) {
      const t = VALID_ICON_TYPES.includes(body.icon_type as typeof VALID_ICON_TYPES[number])
        ? body.icon_type : 'none';
      fields.push(`icon_type = $${i++}`);
      values.push(t);
    }

    if ('image_display_size' in body) {
      const s = ['auto', 'small', 'medium', 'large', 'custom'].includes(body.image_display_size as string)
        ? body.image_display_size : 'auto';
      fields.push(`image_display_size = $${i++}`);
      values.push(s);
    }

    if ('image_display_mode' in body) {
      const m = ['contain', 'cover', 'stretch'].includes(body.image_display_mode as string)
        ? body.image_display_mode : 'contain';
      fields.push(`image_display_mode = $${i++}`);
      values.push(m);
    }

    const clampDim = (v: unknown) =>
      typeof v === 'number' ? Math.max(24, Math.min(200, Math.round(v))) : null;

    if ('image_custom_width' in body) {
      fields.push(`image_custom_width = $${i++}`);
      values.push(clampDim(body.image_custom_width));
    }

    if ('image_custom_height' in body) {
      fields.push(`image_custom_height = $${i++}`);
      values.push(clampDim(body.image_custom_height));
    }

    // Setting is_default = true → clear all others first
    if (body.is_default === true) {
      await pool.query('UPDATE website_game_categories SET is_default = FALSE');
      fields.push(`is_default = $${i++}`);
      values.push(true);
    } else if (body.is_default === false) {
      fields.push(`is_default = $${i++}`);
      values.push(false);
    }

    if (fields.length === 0) {
      const cur = await pool.query<WebsiteGameCategory>('SELECT * FROM website_game_categories WHERE id = $1', [catId]);
      return NextResponse.json(cur.rows[0] ?? null);
    }

    fields.push(`updated_at = NOW()`);
    values.push(catId);

    const res = await pool.query<WebsiteGameCategory>(
      `UPDATE website_game_categories SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!res.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(res.rows[0]);
  } catch (error) {
    console.error('[PATCH /api/website/lobby-categories/[id]]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/website/lobby-categories/[id]
// Returns 409 if category is in use (providers or games reference it).
// Query param ?force=reassign&to_id=N to reassign; ?force=clear to clear FK.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const payload = await requirePermission('website.builder.manage');
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const catId = parseInt(id);
    if (isNaN(catId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const force = req.nextUrl.searchParams.get('force');
    const toId  = req.nextUrl.searchParams.get('to_id');

    // Check usage
    const [provRow, gameRow] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM website_game_providers WHERE category_id = $1', [catId]),
      pool.query('SELECT COUNT(*)::int AS n FROM website_games WHERE category_id = $1', [catId]),
    ]);
    const inUse = (provRow.rows[0].n as number) + (gameRow.rows[0].n as number);

    if (inUse > 0 && !force) {
      return NextResponse.json({
        error: 'in_use',
        provider_count: provRow.rows[0].n,
        game_count:     gameRow.rows[0].n,
      }, { status: 409 });
    }

    if (force === 'reassign' && toId) {
      const newId = parseInt(toId);
      await pool.query('UPDATE website_game_providers SET category_id = $1 WHERE category_id = $2', [newId, catId]);
      await pool.query('UPDATE website_games SET category_id = $1 WHERE category_id = $2', [newId, catId]);
    } else if (force === 'clear') {
      await pool.query('UPDATE website_game_providers SET category_id = NULL WHERE category_id = $1', [catId]);
      await pool.query('UPDATE website_games SET category_id = NULL WHERE category_id = $1', [catId]);
    }

    await pool.query('DELETE FROM website_game_categories WHERE id = $1', [catId]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/website/lobby-categories/[id]]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
