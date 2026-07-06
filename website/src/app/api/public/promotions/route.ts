import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { PublicPromotion } from '@/lib/types';

export async function GET() {
  const res = await pool.query<PublicPromotion>(
    `SELECT id, name, description, promotion_type, bonus_type, bonus_value,
            min_deposit, max_bonus, turnover_multiplier, expiry_date
     FROM promotions
     WHERE is_active = TRUE AND deleted_at IS NULL
       AND (expiry_date IS NULL OR expiry_date > NOW())
     ORDER BY id DESC`
  );
  return NextResponse.json(res.rows);
}
