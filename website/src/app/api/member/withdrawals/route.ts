import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { rateLimit } from '@/lib/rate-limit';
import { ActivityLogService } from '@/lib/services/activity-log';

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = await pool.query(
    `SELECT id, withdraw_amount, status, bank_name, bank_account,
            reject_reason, receipt_media_id, created_at, reviewed_at
     FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [member.sub]
  );
  return NextResponse.json(res.rows, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = rateLimit(`withdraw:${member.sub}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: '提交过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSecs) } }
    );
  }

  const body = await req.json() as { amount?: number };
  if (!body.amount || body.amount <= 0)
    return NextResponse.json({ error: '请输入有效的提款金额' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
           ?? req.headers.get('x-real-ip')
           ?? 'unknown';

  /* Load financial settings (outside transaction — read-only) */
  const settingRes = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM system_settings WHERE key IN ('withdraw_min_amount','max_withdrawals_per_day')`
  );
  const sMap = Object.fromEntries(settingRes.rows.map(r => [r.key, r.value]));
  const minAmount = parseFloat(sMap.withdraw_min_amount ?? '30') || 30;
  if (body.amount < minAmount)
    return NextResponse.json({ error: `最低提款金额为 RM ${minAmount}` }, { status: 400 });

  /* ── Serialisable transaction: lock user row first, then validate, then insert ──
     SELECT FOR UPDATE prevents concurrent withdrawal requests from the same
     member from both passing the balance check before the trigger fires.     */
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    /* Lock the user row — any concurrent request on the same user blocks here */
    const uRow = await client.query<{
      bank_name: string; bank_account: string; bank_holder_name: string;
      available_balance: string; net_deposit: string; pending_withdrawal: string;
    }>(
      `SELECT bank_name, bank_account, bank_holder_name,
              available_balance, net_deposit, pending_withdrawal
       FROM users WHERE id = $1 FOR UPDATE`,
      [member.sub]
    );
    const u = uRow.rows[0];

    if (!u?.bank_account) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: '账户未绑定银行卡，请联系客服' }, { status: 400 });
    }

    /* Balance check against locked available_balance */
    const available = parseFloat(u.available_balance ?? '0');
    if (body.amount > available) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: `可用余额不足，当前可提款 RM ${available.toFixed(2)}` },
        { status: 400 }
      );
    }

    /* Daily withdrawal count limit */
    const maxPerDay = parseInt(sMap.max_withdrawals_per_day ?? '0', 10) || 0;
    if (maxPerDay > 0) {
      const todayRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM withdrawal_requests
         WHERE user_id = $1
           AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
        [member.sub]
      );
      const todayCount = parseInt(todayRes.rows[0]?.cnt ?? '0', 10);
      if (todayCount >= maxPerDay) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: `今日提款次数已达上限（${maxPerDay} 次），请明天再试或联系客服`, today_count: todayCount, limit: maxPerDay },
          { status: 429 }
        );
      }
    }

    /* Insert withdrawal — DB trigger trg_withdrawal_pending fires AFTER INSERT:
       it increments users.pending_withdrawal, which reduces available_balance. */
    const ins = await client.query<{ id: number }>(
      `INSERT INTO withdrawal_requests
         (user_id, withdraw_amount, bank_name, bank_account, bank_holder_name,
          status, provider, game_username)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', 'MANUAL', '')
       RETURNING id`,
      [member.sub, body.amount, u.bank_name, u.bank_account, u.bank_holder_name]
    );
    const withdrawalId = ins.rows[0].id;

    /* Read back updated balance within same transaction for response */
    const balRes = await client.query<{
      available_balance: string; pending_withdrawal: string; net_deposit: string;
    }>(
      `SELECT available_balance, pending_withdrawal, net_deposit FROM users WHERE id = $1`,
      [member.sub]
    );
    const updated = balRes.rows[0];

    await client.query('COMMIT');

    /* Activity log — fire-and-forget, never blocks the response */
    void ActivityLogService.log({
      member_id:      member.sub,
      category:       'WITHDRAWAL',
      action:         'Withdrawal Submitted',
      title:          `提款申请 RM ${body.amount.toFixed(2)}`,
      description:    `${u.bank_name} · ****${u.bank_account.slice(-4)}`,
      amount:         -body.amount,
      balance_before: available,
      balance_after:  parseFloat(updated.available_balance ?? '0'),
      reference_type: 'withdrawal',
      reference_id:   withdrawalId,
      operator_type:  'MEMBER',
      source:         'WEBSITE',
      level:          'INFO',
      ip_address:     ip,
      metadata:       { bank_name: u.bank_name, last4: u.bank_account.slice(-4) },
    });

    return NextResponse.json(
      {
        ok: true,
        id: withdrawalId,
        available_balance:  updated.available_balance,
        pending_withdrawal: updated.pending_withdrawal,
        net_deposit:        updated.net_deposit,
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[withdrawals POST] transaction error:', e);
    return NextResponse.json({ error: '提款提交失败，请重试' }, { status: 500 });
  } finally {
    client.release();
  }
}
