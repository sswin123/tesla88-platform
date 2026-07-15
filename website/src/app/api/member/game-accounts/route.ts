import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

const CHANGE_COOLDOWN_DAYS = 7;

export async function GET(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const provider = req.nextUrl.searchParams.get('provider');
  if (!provider) return NextResponse.json({ error: 'provider is required' }, { status: 400 });

  const { rows } = await pool.query(
    `SELECT uga.id, uga.provider, uga.last_changed_at,
            ap.username, ap.password
     FROM user_game_accounts uga
     JOIN account_pool ap ON ap.id = uga.account_pool_id
     WHERE uga.user_id = $1 AND uga.provider = $2`,
    [member.sub, provider]
  );

  if (!rows[0]) {
    return NextResponse.json({ assigned: false });
  }

  const row = rows[0];
  const lastChanged = new Date(row.last_changed_at);
  const canChangeAt = new Date(lastChanged.getTime() + CHANGE_COOLDOWN_DAYS * 86400 * 1000);
  const now = new Date();
  const canChange = now >= canChangeAt;

  return NextResponse.json({
    assigned:       true,
    username:       row.username,
    password:       row.password,
    can_change:     canChange,
    next_change_at: canChange ? null : canChangeAt.toISOString(),
  });
}
