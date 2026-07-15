import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { hashPassword } from '@/lib/auth';

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const res = await pool.query(
    `SELECT id, public_id, first_name, phone, bank_name, bank_account, bank_holder_name,
            status, total_deposit, total_withdraw, total_bonus, net_deposit,
            referral_code, referred_by, created_at, last_seen_at,
            (SELECT COUNT(*)::int FROM users r WHERE r.referred_by = u.id) AS referral_count
     FROM users u WHERE u.id = $1`,
    [member.sub]
  );
  if (res.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const profile = res.rows[0] as Record<string, unknown>;

  // Active bonus claim — priority: has turnover requirement > no requirement; newest first
  try {
    const bonusRes = await pool.query<{
      id: number; promo_name: string; bonus_amount: string;
      turnover_required: string; turnover_completed: string;
    }>(
      `SELECT bc.id, p.name AS promo_name, bc.bonus_amount,
              bc.turnover_required, bc.turnover_completed
       FROM bonus_claims bc
       JOIN promotions p ON p.id = bc.promotion_id
       WHERE bc.user_id = $1 AND bc.status IN ('PENDING','ACTIVE')
         AND (p.expiry_date IS NULL OR p.expiry_date > NOW())
       ORDER BY (bc.turnover_required > 0) DESC, bc.claimed_at DESC
       LIMIT 1`,
      [member.sub]
    );
    if (bonusRes.rows.length > 0) {
      const ab = bonusRes.rows[0];
      profile.active_bonus_id             = ab.id;
      profile.active_promo_name           = ab.promo_name;
      profile.active_bonus_amount         = ab.bonus_amount;
      profile.active_turnover_required    = ab.turnover_required;
      profile.active_turnover_completed   = ab.turnover_completed;
    }
  } catch { /* bonus_claims may not exist */ }

  return NextResponse.json(profile);
}

export async function PATCH(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { new_password?: string };
  if (!body.new_password)
    return NextResponse.json({ error: 'new_password required' }, { status: 400 });
  if (body.new_password.length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const hash = await hashPassword(body.new_password);
  await pool.query('UPDATE users SET website_password_hash = $1 WHERE id = $2', [hash, member.sub]);
  return NextResponse.json({ ok: true });
}
