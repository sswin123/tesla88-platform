import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { logAudit } from '@/lib/repositories/audit_repo';
import { requirePermission } from '@/lib/require_permission';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; provider: string }> }
) {
  const payload = await requirePermission('members.edit');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, provider } = await params;
  const uid = parseInt(id, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json() as { username?: string };
  const username = body.username?.trim();
  if (!username) return NextResponse.json({ error: 'username is required' }, { status: 400 });

  // Get current account_pool_id and username
  const uga = await pool.query(
    `SELECT uga.id, uga.account_pool_id, ap.username AS old_username
     FROM user_game_accounts uga
     JOIN account_pool ap ON ap.id = uga.account_pool_id
     WHERE uga.user_id = $1 AND uga.provider = $2 AND COALESCE(uga.status, 'ACTIVE') = 'ACTIVE'`,
    [uid, provider]
  );
  if (!uga.rows[0]) return NextResponse.json({ error: 'Game account not found' }, { status: 404 });

  const { account_pool_id, old_username } = uga.rows[0] as { account_pool_id: number; old_username: string };

  await pool.query('UPDATE account_pool SET username = $1 WHERE id = $2', [username, account_pool_id]);

  await logAudit({
    admin_id: payload.sub,
    action: 'MEMBER_GAME_ACCOUNT_EDIT',
    target_type: 'member',
    target_id: uid,
    old_value: { provider, username: old_username },
    new_value: { provider, username },
  });

  return NextResponse.json({ ok: true, provider, username });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; provider: string }> }
) {
  const payload = await requirePermission('members.edit');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, provider } = await params;
  const uid = parseInt(id, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const uga = await pool.query(
    `SELECT uga.id, uga.account_pool_id, ap.username
     FROM user_game_accounts uga
     JOIN account_pool ap ON ap.id = uga.account_pool_id
     WHERE uga.user_id = $1 AND uga.provider = $2 AND COALESCE(uga.status, 'ACTIVE') = 'ACTIVE'`,
    [uid, provider]
  );
  if (!uga.rows[0]) return NextResponse.json({ error: 'Game account not found' }, { status: 404 });

  const { account_pool_id } = uga.rows[0] as { account_pool_id: number; username: string };

  await pool.query(
    `UPDATE user_game_accounts SET status = 'REMOVED' WHERE user_id = $1 AND provider = $2`,
    [uid, provider]
  );
  await pool.query(
    `UPDATE account_pool SET status = 'AVAILABLE' WHERE id = $1`,
    [account_pool_id]
  );

  await logAudit({
    admin_id: payload.sub,
    action: 'MEMBER_GAME_ACCOUNT_REMOVE',
    target_type: 'member',
    target_id: uid,
    old_value: { provider, username: (uga.rows[0] as { username: string }).username },
    new_value: { status: 'REMOVED' },
  });

  return NextResponse.json({ ok: true });
}
