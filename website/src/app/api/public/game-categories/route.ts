import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export interface PublicGameCategory {
  code: string;
  name: string;
  icon: string | null;
  sort_order: number;
}

/**
 * GET /api/public/game-categories
 *
 * Returns active game categories managed in ERP.
 * Website uses these to build its dynamic tab bar.
 */
export async function GET() {
  try {
    const { rows } = await pool.query<PublicGameCategory>(
      `SELECT code, name, icon, sort_order
       FROM gp_game_categories
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, id ASC`,
    );
    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch {
    // Fallback hardcoded categories if table doesn't exist yet
    return NextResponse.json([
      { code: 'slot',    name: '老虎机 Slot',    icon: '🎰', sort_order: 1 },
      { code: 'live',    name: '真人娱乐 Live',   icon: '🎲', sort_order: 2 },
      { code: 'sport',   name: '体育博彩 Sport',  icon: '⚽', sort_order: 3 },
      { code: 'fishing', name: '捕鱼游戏 Fishing',icon: '🎣', sort_order: 4 },
    ]);
  }
}
