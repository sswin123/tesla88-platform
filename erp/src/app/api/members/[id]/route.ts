import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import pool from '@/lib/db';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const uid = parseInt(id, 10);

  const [memberRows, accounts, deposits, withdrawals, bonuses] = await Promise.all([
    pool.query(
      `SELECT u.*,
         (SELECT COUNT(*)::int FROM deposit_requests   WHERE user_id = u.id AND status = 'APPROVED') AS deposit_count,
         (SELECT COUNT(*)::int FROM withdrawal_requests WHERE user_id = u.id AND status = 'PAID')    AS withdrawal_count
       FROM users u WHERE u.id = $1`,
      [uid]
    ),
    pool.query(
      'SELECT provider, username, created_at FROM game_accounts WHERE user_id = $1 ORDER BY created_at',
      [uid]
    ),
    pool.query(
      `SELECT id, provider, deposit_amount, bonus_amount, credit_amount, status, created_at,
              reviewed_at, p.name AS promo_name
       FROM deposit_requests dr
       LEFT JOIN promotions p ON p.id = dr.promotion_id
       WHERE dr.user_id = $1 ORDER BY dr.created_at DESC LIMIT 20`,
      [uid]
    ),
    pool.query(
      `SELECT id, provider, game_username, withdraw_amount, bank_name, bank_account, status,
              created_at, reviewed_at
       FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [uid]
    ),
    pool.query(
      `SELECT bc.id, p.name AS promo_name, bc.deposit_amount, bc.bonus_amount,
              bc.total_credit, bc.turnover_required, bc.turnover_completed,
              bc.status, bc.claimed_at, bc.completed_at
       FROM bonus_claims bc
       JOIN promotions p ON p.id = bc.promotion_id
       WHERE bc.user_id = $1 ORDER BY bc.claimed_at DESC LIMIT 20`,
      [uid]
    ),
  ]);

  if (!memberRows.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    member:      memberRows.rows[0],
    accounts:    accounts.rows,
    deposits:    deposits.rows,
    withdrawals: withdrawals.rows,
    bonuses:     bonuses.rows,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const uid = parseInt(id, 10);

  const body: { status?: string; remarks?: string } = await request.json();

  if (body.status !== undefined) {
    if (!['ACTIVE', 'FROZEN'].includes(body.status)) {
      return NextResponse.json({ error: 'status must be ACTIVE or FROZEN' }, { status: 400 });
    }
    const { rows } = await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2 RETURNING id, status',
      [body.status, uid]
    );
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await logAudit({
      admin_id: payload.sub,
      action: body.status === 'FROZEN' ? 'MEMBER_FREEZE' : 'MEMBER_UNFREEZE',
      target_type: 'member',
      target_id: uid,
      new_value: { status: body.status },
    });
    return NextResponse.json(rows[0]);
  }

  if (body.remarks !== undefined) {
    const { rows } = await pool.query(
      'UPDATE users SET remarks = $1 WHERE id = $2 RETURNING id, remarks',
      [body.remarks, uid]
    );
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await logAudit({
      admin_id: payload.sub,
      action: 'MEMBER_REMARK',
      target_type: 'member',
      target_id: uid,
      new_value: { remarks: body.remarks },
    });
    return NextResponse.json(rows[0]);
  }

  return NextResponse.json({ error: 'No valid field to update' }, { status: 400 });
}
