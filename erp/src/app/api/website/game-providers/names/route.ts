import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import pool from '@/lib/db';

// GET /api/website/game-providers/names
// Returns provider id + provider_name for any authenticated admin.
// Used by pages that need provider name list but don't manage providers
// (e.g., Bank Manager provider binding dropdown).

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { rows } = await pool.query<{ id: number; provider_name: string }>(
      `SELECT id, provider_name FROM website_game_providers
       WHERE is_active = TRUE
       ORDER BY display_order ASC, id ASC`
    );
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
