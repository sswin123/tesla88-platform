import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider } = await req.json() as { provider?: string };
  if (!provider) return NextResponse.json({ error: 'provider is required' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if user already has an account for this provider
    const existing = await client.query(
      `SELECT id FROM user_game_accounts
       WHERE user_id = $1 AND provider = $2`,
      [member.sub, provider]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: '您已有该游戏账号' }, { status: 409 });
    }

    // Lock and claim an AVAILABLE account
    const { rows } = await client.query(
      `SELECT id, username, password FROM account_pool
       WHERE provider = $1 AND status = 'AVAILABLE'
       ORDER BY id
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [provider]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: '暂无可用账号，请联系客服' }, { status: 503 });
    }

    const acct = rows[0];

    await client.query(
      `UPDATE account_pool
       SET status = 'ASSIGNED', assigned_user_id = $2, assigned_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [acct.id, member.sub]
    );

    await client.query(
      `INSERT INTO user_game_accounts (user_id, provider, account_pool_id, assigned_by, last_changed_at)
       VALUES ($1, $2, $3, NULL, NOW())`,
      [member.sub, provider, acct.id]
    );

    await client.query('COMMIT');
    return NextResponse.json({ ok: true, username: acct.username, password: acct.password }, { status: 201 });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[game-accounts/claim]', err);
    return NextResponse.json({ error: '系统错误，请稍后重试' }, { status: 500 });
  } finally {
    client.release();
  }
}
