import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { rateLimit } from '@/lib/rate-limit';
import { ActivityLogService } from '@/lib/services/activity-log';

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = await pool.query(
    `SELECT id, withdraw_amount, status, bank_name, bank_account, created_at, reviewed_at
     FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [member.sub]
  );
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = rateLimit(`withdraw:${member.sub}`, 3, 60_000);
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

  /* Fetch user bank info + available_balance (GENERATED column) */
  const userRes = await pool.query<{
    bank_name: string; bank_account: string; bank_holder_name: string;
    available_balance: string;
  }>(
    'SELECT bank_name, bank_account, bank_holder_name, available_balance FROM users WHERE id = $1',
    [member.sub]
  );
  const u = userRes.rows[0];
  if (!u?.bank_account)
    return NextResponse.json({ error: '账户未绑定银行卡，请联系客服' }, { status: 400 });

  /* Load financial settings */
  const settingRes = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM system_settings WHERE key IN ('withdraw_min_amount','max_withdrawals_per_day')`
  );
  const sMap = Object.fromEntries(settingRes.rows.map(r => [r.key, r.value]));
  const minAmount = parseFloat(sMap.withdraw_min_amount ?? '30') || 30;
  if (body.amount < minAmount)
    return NextResponse.json({ error: `最低提款金额为 RM ${minAmount}` }, { status: 400 });

  /* Daily withdrawal limit */
  const maxPerDay = parseInt(sMap.max_withdrawals_per_day ?? '0', 10) || 0;
  if (maxPerDay > 0) {
    const todayRes = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM withdrawal_requests
       WHERE user_id = $1
         AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
      [member.sub]
    );
    const todayCount = parseInt(todayRes.rows[0]?.cnt ?? '0', 10);
    if (todayCount >= maxPerDay) {
      return NextResponse.json(
        { error: `您今天的提款次数已达上限（${maxPerDay} 次）。请明天再试或联系客服。`, today_count: todayCount, limit: maxPerDay },
        { status: 429 }
      );
    }
  }

  /* Balance check — available_balance is the GENERATED column (net_deposit - pending_withdrawal) */
  const available = parseFloat(u.available_balance ?? '0');
  if (body.amount > available)
    return NextResponse.json({ error: '提款金额超过可用余额' }, { status: 400 });

  /* Duplicate pending prevention */
  const pendingRes = await pool.query<{ id: number }>(
    `SELECT id FROM withdrawal_requests WHERE user_id = $1 AND status = 'PENDING' LIMIT 1`,
    [member.sub]
  );
  if (pendingRes.rows.length > 0)
    return NextResponse.json(
      { error: '已有一笔提款申请处理中，请等待完成后再申请', pending_id: pendingRes.rows[0].id },
      { status: 409 }
    );

  /* Insert withdrawal request.
     The DB trigger trg_withdrawal_pending automatically increments
     users.pending_withdrawal upon INSERT with status='PENDING'. */
  const res = await pool.query<{ id: number }>(
    `INSERT INTO withdrawal_requests
       (user_id, withdraw_amount, bank_name, bank_account, bank_holder_name, status, provider, game_username)
     VALUES ($1, $2, $3, $4, $5, 'PENDING', 'MANUAL', '')
     RETURNING id`,
    [member.sub, body.amount, u.bank_name, u.bank_account, u.bank_holder_name]
  );
  const withdrawalId = res.rows[0].id;

  /* Activity log (fire-and-forget) */
  void ActivityLogService.log({
    member_id:      member.sub,
    category:       'WITHDRAWAL',
    action:         'Withdrawal Submitted',
    title:          `提款申请 RM ${body.amount.toFixed(2)}`,
    description:    `${u.bank_name} · ****${u.bank_account.slice(-4)}`,
    amount:         -body.amount,
    balance_before: available,
    balance_after:  available - body.amount,
    reference_type: 'withdrawal',
    reference_id:   withdrawalId,
    operator_type:  'MEMBER',
    source:         'WEBSITE',
    level:          'INFO',
    ip_address:     ip,
    metadata:       { bank_name: u.bank_name, last4: u.bank_account.slice(-4) },
  });

  return NextResponse.json({ ok: true, id: withdrawalId }, { status: 201 });
}
