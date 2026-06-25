import pool from '@/lib/db';
import type { Promotion, BonusClaim } from '@/lib/types';

export async function getActivePromotions(): Promise<Promotion[]> {
  const { rows } = await pool.query<Promotion>(
    'SELECT * FROM promotions WHERE is_active = TRUE AND deleted_at IS NULL ORDER BY id'
  );
  return rows;
}

export async function getAllPromotions(): Promise<Promotion[]> {
  const { rows } = await pool.query<Promotion>(
    'SELECT * FROM promotions WHERE deleted_at IS NULL ORDER BY id'
  );
  return rows;
}

export async function getPromotionById(id: number): Promise<Promotion | null> {
  const { rows } = await pool.query<Promotion>(
    'SELECT * FROM promotions WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return rows[0] ?? null;
}

export async function createPromotion(data: {
  name: string;
  description: string | null;
  promotion_type: string;
  bonus_type: string;
  bonus_value: number;
  min_deposit: number;
  max_bonus: number | null;
  turnover_multiplier: number;
  turnover_type: string;
  allowed_games: string[];
  expiry_date?: string | null;
}): Promise<Promotion> {
  const { rows } = await pool.query<Promotion>(
    `INSERT INTO promotions
       (name, description, promotion_type, bonus_type, bonus_value,
        min_deposit, max_bonus, turnover_multiplier, turnover_type, allowed_games, expiry_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      data.name, data.description, data.promotion_type, data.bonus_type,
      data.bonus_value, data.min_deposit, data.max_bonus,
      data.turnover_multiplier, data.turnover_type, data.allowed_games,
      data.expiry_date ?? null,
    ]
  );
  return rows[0];
}

export async function updatePromotion(
  id: number,
  data: Partial<Pick<Promotion,
    'name' | 'description' | 'bonus_value' | 'min_deposit' |
    'max_bonus' | 'turnover_multiplier' | 'turnover_type' | 'allowed_games' | 'expiry_date'>>
): Promise<Promotion | null> {
  const fields = Object.keys(data) as (keyof typeof data)[];
  if (fields.length === 0) return null;
  const setClauses = fields.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = fields.map((k) => data[k]);
  const { rows } = await pool.query<Promotion>(
    `UPDATE promotions SET ${setClauses}, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [id, ...values]
  );
  return rows[0] ?? null;
}

export async function setPromotionActive(id: number, is_active: boolean): Promise<Promotion | null> {
  const { rows } = await pool.query<Promotion>(
    'UPDATE promotions SET is_active = $2, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
    [id, is_active]
  );
  return rows[0] ?? null;
}

export async function softDeletePromotion(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE promotions SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return (rowCount ?? 0) > 0;
}

export async function getPendingClaims(): Promise<(BonusClaim & { promo_name: string; first_name: string; phone: string })[]> {
  const { rows } = await pool.query(
    `SELECT bc.*, p.name AS promo_name, u.first_name, u.phone
     FROM bonus_claims bc
     JOIN promotions p ON p.id = bc.promotion_id
     JOIN users u ON u.id = bc.user_id
     WHERE bc.status = 'PENDING'
     ORDER BY bc.claimed_at`
  );
  return rows;
}
