import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { rateLimit } from '@/lib/rate-limit';

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

  /* Fetch user bank info + balance */
  const userRes = await pool.query<{
    bank_name: string; bank_account: string; bank_holder_name: string; net_deposit: string;
  }>(
    'SELECT bank_name, bank_account, bank_holder_name, net_deposit FROM users WHERE id = $1',
    [member.sub]
  );
  const u = userRes.rows[0];
  if (!u?.bank_account)
    return NextResponse.json({ error: '账户未绑定银行卡，请联系客服' }, { status: 400 });

  /* Minimum withdraw amount */
  const settingRes = await pool.query<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'withdraw_min_amount'`
  );
  const minAmount = parseFloat(settingRes.rows[0]?.value ?? '30') || 30;
  if (body.amount < minAmount)
    return NextResponse.json({ error: `最低提款金额为 RM ${minAmount}` }, { status: 400 });

  /* Balance check */
  const balance = parseFloat(u.net_deposit ?? '0');
  if (body.amount > balance)
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

  const res = await pool.query(
    `INSERT INTO withdrawal_requests
       (user_id, withdraw_amount, bank_name, bank_account, bank_holder_name, status, provider, game_username)
     VALUES ($1, $2, $3, $4, $5, 'PENDING', 'MANUAL', '')
     RETURNING id`,
    [member.sub, body.amount, u.bank_name, u.bank_account, u.bank_holder_name]
  );
  return NextResponse.json({ ok: true, id: res.rows[0].id }, { status: 201 });
}
