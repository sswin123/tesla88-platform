import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

/**
 * POST /api/games/library/bulk
 *
 * Bulk operations on gp_games rows.
 *
 * Body: { action, ids, payload? }
 *
 * Supported actions:
 *   enable        → is_active = TRUE
 *   disable       → is_active = FALSE
 *   maintenance   → is_maintenance = TRUE
 *   unmaintenance → is_maintenance = FALSE
 *   hot_on        → is_hot = TRUE
 *   hot_off       → is_hot = FALSE
 *   new_on        → is_new = TRUE
 *   new_off       → is_new = FALSE
 *   featured_on   → featured = TRUE
 *   featured_off  → featured = FALSE
 *   set_category  → category = payload.category
 *   set_launch    → launch_mode = payload.launch_mode
 *   delete        → DELETE FROM gp_games WHERE id IN (...)
 */
export async function POST(req: NextRequest) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    action:   string;
    ids:      number[];
    payload?: Record<string, unknown>;
  };

  if (!body.action || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'action and ids[] are required' }, { status: 400 });
  }

  const ids = body.ids.map(Number).filter(n => !isNaN(n));
  if (ids.length === 0) return NextResponse.json({ error: 'No valid ids' }, { status: 400 });

  const VALID_LAUNCH_MODES = ['LOBBY','DIRECT','EXTERNAL','DOWNLOAD','COMING_SOON'];
  const VALID_CATS = ['slot','live','sport','fishing','lottery','arcade','crash','virtual'];

  let sql: string;
  let vals: unknown[];

  switch (body.action) {
    case 'enable':        sql = `UPDATE gp_games SET is_active=TRUE, updated_at=NOW() WHERE id = ANY($1)`; vals = [ids]; break;
    case 'disable':       sql = `UPDATE gp_games SET is_active=FALSE, updated_at=NOW() WHERE id = ANY($1)`; vals = [ids]; break;
    case 'maintenance':   sql = `UPDATE gp_games SET is_maintenance=TRUE, updated_at=NOW() WHERE id = ANY($1)`; vals = [ids]; break;
    case 'unmaintenance': sql = `UPDATE gp_games SET is_maintenance=FALSE, updated_at=NOW() WHERE id = ANY($1)`; vals = [ids]; break;
    case 'hot_on':        sql = `UPDATE gp_games SET is_hot=TRUE, updated_at=NOW() WHERE id = ANY($1)`; vals = [ids]; break;
    case 'hot_off':       sql = `UPDATE gp_games SET is_hot=FALSE, updated_at=NOW() WHERE id = ANY($1)`; vals = [ids]; break;
    case 'new_on':        sql = `UPDATE gp_games SET is_new=TRUE, updated_at=NOW() WHERE id = ANY($1)`; vals = [ids]; break;
    case 'new_off':       sql = `UPDATE gp_games SET is_new=FALSE, updated_at=NOW() WHERE id = ANY($1)`; vals = [ids]; break;
    case 'featured_on':   sql = `UPDATE gp_games SET featured=TRUE, updated_at=NOW() WHERE id = ANY($1)`; vals = [ids]; break;
    case 'featured_off':  sql = `UPDATE gp_games SET featured=FALSE, updated_at=NOW() WHERE id = ANY($1)`; vals = [ids]; break;
    case 'set_category': {
      const cat = body.payload?.category as string | undefined;
      if (!cat || !VALID_CATS.includes(cat)) {
        return NextResponse.json({ error: `payload.category must be one of: ${VALID_CATS.join(', ')}` }, { status: 400 });
      }
      sql  = `UPDATE gp_games SET category=$2, updated_at=NOW() WHERE id = ANY($1)`;
      vals = [ids, cat];
      break;
    }
    case 'set_launch': {
      const mode = body.payload?.launch_mode as string | undefined;
      if (!mode || !VALID_LAUNCH_MODES.includes(mode)) {
        return NextResponse.json({ error: `payload.launch_mode must be one of: ${VALID_LAUNCH_MODES.join(', ')}` }, { status: 400 });
      }
      sql  = `UPDATE gp_games SET launch_mode=$2, updated_at=NOW() WHERE id = ANY($1)`;
      vals = [ids, mode];
      break;
    }
    case 'delete':
      sql  = `DELETE FROM gp_games WHERE id = ANY($1)`;
      vals = [ids];
      break;
    default:
      return NextResponse.json({ error: `Unknown action "${body.action}"` }, { status: 400 });
  }

  const { rowCount } = await pool.query(sql, vals);
  return NextResponse.json({ ok: true, affected: rowCount ?? 0 });
}
