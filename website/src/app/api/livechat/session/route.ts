import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

const GUEST_COOKIE = 'guest_chat_id';

function generateGuestId(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = 'Guest_';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function GET(req: NextRequest) {
  const member = await getMember();

  if (member) {
    // Authenticated member flow (unchanged)
    const existing = await pool.query(
      `SELECT id, status, created_at FROM support_sessions
       WHERE user_id = $1 AND status IN ('OPEN','ACTIVE') ORDER BY created_at DESC LIMIT 1`,
      [member.sub]
    );
    if (existing.rows.length > 0) return NextResponse.json(existing.rows[0]);

    const created = await pool.query(
      `INSERT INTO support_sessions (user_id, status, source, last_message_at) VALUES ($1, 'OPEN', 'website', NOW())
       RETURNING id, status, created_at`,
      [member.sub]
    );
    return NextResponse.json(created.rows[0], { status: 201 });
  }

  // Guest flow: use cookie to identify visitor
  let guestId = req.cookies?.get(GUEST_COOKIE)?.value;

  if (guestId) {
    // Find existing open/active session for this guest
    const existing = await pool.query(
      `SELECT id, status, created_at FROM support_sessions
       WHERE guest_id = $1 AND status IN ('OPEN','ACTIVE') ORDER BY created_at DESC LIMIT 1`,
      [guestId]
    );
    if (existing.rows.length > 0) return NextResponse.json(existing.rows[0]);
  } else {
    guestId = generateGuestId();
  }

  // Create new guest session
  const created = await pool.query(
    `INSERT INTO support_sessions (user_id, guest_id, status, source, last_message_at)
     VALUES (NULL, $1, 'OPEN', 'website_guest', NOW())
     RETURNING id, status, created_at`,
    [guestId]
  );

  const res = NextResponse.json(created.rows[0], { status: 201 });
  res.cookies.set(GUEST_COOKIE, guestId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 90, // 90 days
    path: '/',
  });
  return res;
}
