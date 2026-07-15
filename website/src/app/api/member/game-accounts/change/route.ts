import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

const CHANGE_COOLDOWN_DAYS = 7;

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider } = await req.json() as { provider?: string };
  if (!provider) return NextResponse.json({ error: 'provider is required' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current assignment
    const { rows: current } = await client.query(
      `SELECT uga.id, uga.account_pool_id, uga.last_changed_at
       FROM user_game_accounts uga
       WHERE uga.user_id = $1 AND uga.provider = $2
       FOR UPDATE`,
      [member.sub, provider]
    );

    if (!current[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: '您没有该游戏账号' }, { status: 404 });
    }

    const row = current[0];
    const lastChanged = new Date(row.last_changed_at);
    const canChangeAt = new Date(lastChanged.getTime() + CHANGE_COOLDOWN_DAYS * 86400 * 1000);
    if (new Date() < canChangeAt) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: `换号冷却中，可换号时间：${canChangeAt.toLocaleString('zh-CN')}`, next_change_at: canChangeAt.toISOString() },
        { status: 429 }
      );
    }

    // Lock a new AVAILABLE account (different from current)
    const { rows: newAccts } = await client.query(
      `SELECT id, username, password FROM account_pool
       WHERE provider = $1 AND status = 'AVAILABLE' AND id != $2
       ORDER BY id
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [provider, row.account_pool_id]
    );

    if (!newAccts[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: '暂无可用账号，请联系客服' }, { status: 503 });
    }

    const newAcct = newAccts[0];

    // Release old account back to pool
    await client.query(
      `UPDATE account_pool
       SET status = 'AVAILABLE', assigned_user_id = NULL, assigned_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [row.account_pool_id]
    );

    // Mark new account as ASSIGNED
    await client.query(
      `UPDATE account_pool
       SET status = 'ASSIGNED', assigned_user_id = $2, assigned_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [newAcct.id, member.sub]
    );

    // Update user_game_accounts with new pool id and reset cooldown
    await client.query(
      `UPDATE user_game_accounts
       SET account_pool_id = $3, assigned_at = NOW(), last_changed_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [row.id, member.sub, newAcct.id]
    );

    await client.query('COMMIT');
    return NextResponse.json({ ok: true, username: newAcct.username, password: newAcct.password });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[game-accounts/change]', err);
    return NextResponse.json({ error: '系统错误，请稍后重试' }, { status: 500 });
  } finally {
    client.release();
  }
}
