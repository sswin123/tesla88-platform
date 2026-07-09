import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { rateLimit } from '@/lib/rate-limit';

const VALID_PROVIDERS = ['918Kiss', 'Mega888', 'Pussy888', 'Newtown', 'Ace333', 'Live22'] as const;

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = await pool.query(
    `SELECT id, deposit_amount, bonus_amount, status, provider, payment_bank, created_at, reviewed_at
     FROM deposit_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [member.sub]
  );
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = rateLimit(`deposit:${member.sub}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: '提交过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSecs) } }
    );
  }

  const body = await req.json() as {
    amount?: number;
    provider?: string;
    payment_bank?: string;
    promotion_id?: number;
    game_username?: string;
    receipt_file_id?: string;
  };

  if (!body.amount || body.amount <= 0)
    return NextResponse.json({ error: '请输入有效的存款金额' }, { status: 400 });
  if (!body.provider || !(VALID_PROVIDERS as readonly string[]).includes(body.provider))
    return NextResponse.json({ error: '请选择游戏' }, { status: 400 });
  if (!body.payment_bank)
    return NextResponse.json({ error: '请选择付款方式' }, { status: 400 });

  /* Minimum deposit check */
  const minRow = await pool.query<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'deposit_min_amount'`
  );
  const minAmount = parseFloat(minRow.rows[0]?.value ?? '30');
  if (body.amount < minAmount)
    return NextResponse.json({ error: `最低存款金额为 RM ${minAmount.toFixed(0)}` }, { status: 400 });

  /* Duplicate pending prevention */
  const pending = await pool.query<{ id: number }>(
    `SELECT id FROM deposit_requests WHERE user_id = $1 AND status = 'PENDING' LIMIT 1`,
    [member.sub]
  );
  if (pending.rows.length > 0)
    return NextResponse.json(
      { error: '您有一笔存款正在审核中，请等待处理后再提交新的存款申请', pending_id: pending.rows[0].id },
      { status: 409 }
    );

  /* Bonus calculation from promotion */
  let bonusAmount = 0;
  let promotionId: number | null = body.promotion_id ?? null;

  if (promotionId) {
    const promoRes = await pool.query<{
      id: number;
      bonus_type: string;
      bonus_value: string;
      min_deposit: string;
      max_bonus: string | null;
    }>(
      `SELECT id, bonus_type, bonus_value, min_deposit, max_bonus
       FROM promotions
       WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL
         AND (expiry_date IS NULL OR expiry_date > NOW())`,
      [promotionId]
    );
    const promo = promoRes.rows[0];
    if (!promo) {
      promotionId = null; /* promo no longer valid, ignore silently */
    } else if (body.amount >= parseFloat(promo.min_deposit)) {
      if (promo.bonus_type === 'PERCENTAGE') {
        bonusAmount = body.amount * (parseFloat(promo.bonus_value) / 100);
        if (promo.max_bonus) {
          bonusAmount = Math.min(bonusAmount, parseFloat(promo.max_bonus));
        }
      } else {
        bonusAmount = parseFloat(promo.bonus_value);
      }
      bonusAmount = Math.round(bonusAmount * 100) / 100;
    }
  }

  const creditAmount = body.amount + bonusAmount;

  const res = await pool.query<{ id: number }>(
    `INSERT INTO deposit_requests
       (user_id, provider, game_username, deposit_amount, bonus_amount,
        credit_amount, payment_bank, receipt_file_id, status, promotion_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)
     RETURNING id`,
    [
      member.sub,
      body.provider,
      body.game_username ?? '',
      body.amount,
      bonusAmount,
      creditAmount,
      body.payment_bank,
      body.receipt_file_id ?? '',
      promotionId,
    ]
  );
  return NextResponse.json({ ok: true, id: res.rows[0].id, bonus_amount: bonusAmount, credit_amount: creditAmount }, { status: 201 });
}
