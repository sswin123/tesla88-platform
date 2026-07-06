import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Return existing open/active session
  const existing = await pool.query(
    `SELECT id, status, created_at FROM support_sessions
     WHERE user_id = $1 AND status IN ('OPEN','ACTIVE') ORDER BY created_at DESC LIMIT 1`,
    [member.sub]
  );
  if (existing.rows.length > 0) return NextResponse.json(existing.rows[0]);

  // Create new session
  const created = await pool.query(
    `INSERT INTO support_sessions (user_id, status, last_message_at) VALUES ($1, 'OPEN', NOW())
     RETURNING id, status, created_at`,
    [member.sub]
  );
  return NextResponse.json(created.rows[0], { status: 201 });
}
