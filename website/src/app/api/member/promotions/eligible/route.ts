import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import type { PublicPromotion } from '@/lib/types';

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  /* All active, non-expired promotions */
  const promoRes = await pool.query<PublicPromotion & { promotion_type: string }>(
    `SELECT id, name, description, promotion_type, bonus_type, bonus_value,
            min_deposit, max_bonus, turnover_multiplier, expiry_date
     FROM promotions
     WHERE is_active = TRUE AND deleted_at IS NULL
       AND (expiry_date IS NULL OR expiry_date > NOW())
     ORDER BY id DESC`
  );

  /* IDs of one-time promos this member already has an APPROVED claim for */
  const claimedRes = await pool.query<{ promotion_id: number }>(
    `SELECT DISTINCT promotion_id
     FROM bonus_claims
     WHERE user_id = $1 AND status IN ('ACTIVE','COMPLETED')`,
    [member.sub]
  );
  const claimedIds = new Set(claimedRes.rows.map(r => r.promotion_id));

  /* Also check deposit_requests to hide promos with a PENDING claim already submitted */
  const pendingPromoRes = await pool.query<{ promotion_id: number }>(
    `SELECT DISTINCT promotion_id
     FROM deposit_requests
     WHERE user_id = $1 AND status = 'PENDING' AND promotion_id IS NOT NULL`,
    [member.sub]
  );
  const pendingPromoIds = new Set(pendingPromoRes.rows.map(r => r.promotion_id));

  const eligible = promoRes.rows.filter(p => {
    /* Hide one-time promos already claimed (APPROVED) */
    if (p.promotion_type === 'FIRST_DEPOSIT' && claimedIds.has(p.id)) return false;
    /* Hide promos already in a PENDING deposit (avoid double-claim) */
    if (pendingPromoIds.has(p.id)) return false;
    return true;
  });

  return NextResponse.json(eligible);
}
