import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import { createSessionForUser } from '@/lib/repositories/support_repo';

type Ctx = { params: Promise<{ memberId: string }> };

// Returns the most recent livechat session for a member.
// Priority: OPEN → ACTIVE → most recent of any status.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('livechat.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;
  const uid = parseInt(memberId, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid member ID' }, { status: 400 });

  const { rows } = await pool.query<{ id: number; status: string }>(
    `SELECT id, status
     FROM support_sessions
     WHERE user_id = $1
     ORDER BY
       CASE status WHEN 'OPEN' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END,
       created_at DESC
     LIMIT 1`,
    [uid]
  );

  if (rows.length === 0) return NextResponse.json({ session_id: null });
  return NextResponse.json({ session_id: rows[0].id, status: rows[0].status });
}

// Finds the existing OPEN/ACTIVE session OR creates a new one.
// Used by Member Profile "Chat" button.
export async function POST(_req: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('livechat.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;
  const uid = parseInt(memberId, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid member ID' }, { status: 400 });

  // Check if member exists
  const userRow = await pool.query<{ id: number }>(
    `SELECT id FROM users WHERE id = $1 LIMIT 1`,
    [uid]
  );
  if (userRow.rows.length === 0) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  // Find existing active session
  const { rows } = await pool.query<{ id: number; status: string }>(
    `SELECT id, status
     FROM support_sessions
     WHERE user_id = $1 AND status IN ('OPEN', 'ACTIVE')
     ORDER BY created_at DESC
     LIMIT 1`,
    [uid]
  );

  if (rows.length > 0) {
    return NextResponse.json({ session_id: rows[0].id, created: false });
  }

  // No active session — create one
  const session = await createSessionForUser(uid, payload.username);
  return NextResponse.json({ session_id: session.id, created: true }, { status: 201 });
}
