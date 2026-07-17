import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { rateLimit } from '@/lib/rate-limit';


function isMissingColumnError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as Record<string, unknown>).code === '42703';
}

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
    receiving_bank_id?: number;
    payment_bank?: string;
    promotion_id?: number;
    game_username?: string;
    receipt_media_id?: number;
    receipt_file_id?: string;
  };

  if (!body.amount || body.amount <= 0)
    return NextResponse.json({ error: '请输入有效的存款金额' }, { status: 400 });
  if (!body.receiving_bank_id && !body.payment_bank)
    return NextResponse.json({ error: '请选择收款银行' }, { status: 400 });

  // Resolve receiving bank text — fallback if maintenance_mode column not yet migrated
  let paymentBankText = body.payment_bank ?? '';
  if (body.receiving_bank_id) {
    let bankRow: { bank_name: string } | undefined;
    for (const sql of [
      `SELECT bank_name FROM payment_banks WHERE id = $1 AND is_active = TRUE AND maintenance_mode = FALSE`,
      `SELECT bank_name FROM payment_banks WHERE id = $1 AND is_active = TRUE`,
    ]) {
      try {
        const res = await pool.query<{ bank_name: string }>(sql, [body.receiving_bank_id]);
        bankRow = res.rows[0];
        break;
      } catch (err) {
        if (isMissingColumnError(err)) continue;
        throw err;
      }
    }
    if (!bankRow) {
      return NextResponse.json({ error: '所选银行不可用' }, { status: 400 });
    }
    paymentBankText = bankRow.bank_name;
  }

  const gameUsername = body.game_username ?? '';

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

  /* Bonus calculation */
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
      promotionId = null;
    } else if (body.amount >= parseFloat(promo.min_deposit)) {
      if (promo.bonus_type === 'PERCENTAGE') {
        bonusAmount = body.amount * (parseFloat(promo.bonus_value) / 100);
        if (promo.max_bonus) bonusAmount = Math.min(bonusAmount, parseFloat(promo.max_bonus));
      } else {
        bonusAmount = parseFloat(promo.bonus_value);
      }
      bonusAmount = Math.round(bonusAmount * 100) / 100;
    }
  }

  const creditAmount = body.amount + bonusAmount;

  // INSERT — try new schema first (migration 027), fall back to legacy schema
  const baseParams = [
    member.sub, body.provider ?? '', gameUsername,
    body.amount, bonusAmount, creditAmount,
    paymentBankText, body.receipt_file_id ?? '',
    promotionId,
  ];

  const insertAttempts: Array<{ sql: string; params: unknown[] }> = [
    {
      sql: `INSERT INTO deposit_requests
              (user_id, provider, game_username, deposit_amount, bonus_amount,
               credit_amount, payment_bank, receipt_file_id, status, promotion_id,
               receiving_bank_id, receipt_media_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9, $10, $11)
            RETURNING id`,
      params: [...baseParams, body.receiving_bank_id ?? null, body.receipt_media_id ?? null],
    },
    {
      sql: `INSERT INTO deposit_requests
              (user_id, provider, game_username, deposit_amount, bonus_amount,
               credit_amount, payment_bank, receipt_file_id, status, promotion_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)
            RETURNING id`,
      params: [...baseParams],
    },
  ];

  for (const attempt of insertAttempts) {
    try {
      const res = await pool.query<{ id: number }>(attempt.sql, attempt.params);
      return NextResponse.json(
        { ok: true, id: res.rows[0].id, bonus_amount: bonusAmount, credit_amount: creditAmount },
        { status: 201 }
      );
    } catch (err) {
      if (isMissingColumnError(err)) {
        console.warn('[member/deposits] migration 027 pending, trying legacy INSERT');
        continue;
      }
      console.error('[member/deposits] INSERT error:', err);
      return NextResponse.json({ error: '提交失败，请重试' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: '系统错误，请联系客服' }, { status: 500 });
}
