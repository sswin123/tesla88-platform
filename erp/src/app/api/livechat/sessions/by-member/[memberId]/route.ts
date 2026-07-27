import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

// Returns the most recent livechat session for a member.
// Priority: OPEN → ACTIVE → most recent of any status.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
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
       CASE status
         WHEN 'OPEN'   THEN 0
         WHEN 'ACTIVE' THEN 1
         ELSE               2
       END,
       created_at DESC
     LIMIT 1`,
    [uid]
  );

  if (rows.length === 0) {
    return NextResponse.json({ session_id: null });
  }
  return NextResponse.json({ session_id: rows[0].id, status: rows[0].status });
}
