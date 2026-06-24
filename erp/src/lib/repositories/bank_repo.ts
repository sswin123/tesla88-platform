import pool from '@/lib/db';
import type { PaymentBank } from '@/lib/types';

export async function getAllBanks(): Promise<PaymentBank[]> {
  const { rows } = await pool.query<PaymentBank>(
    'SELECT * FROM payment_banks ORDER BY sort_order, id'
  );
  return rows;
}

export async function getActiveBanks(): Promise<PaymentBank[]> {
  const { rows } = await pool.query<PaymentBank>(
    'SELECT * FROM payment_banks WHERE is_active = TRUE ORDER BY sort_order, id'
  );
  return rows;
}

export async function getBankById(id: number): Promise<PaymentBank | null> {
  const { rows } = await pool.query<PaymentBank>(
    'SELECT * FROM payment_banks WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
}

export async function createBank(data: {
  bank_name: string;
  account_number: string;
  account_holder: string;
  sort_order?: number;
}): Promise<PaymentBank> {
  const { rows } = await pool.query<PaymentBank>(
    `INSERT INTO payment_banks (bank_name, account_number, account_holder, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.bank_name, data.account_number, data.account_holder, data.sort_order ?? 0]
  );
  return rows[0];
}

export async function updateBank(
  id: number,
  data: Partial<Pick<PaymentBank, 'bank_name' | 'account_number' | 'account_holder' | 'sort_order'>>
): Promise<PaymentBank | null> {
  const fields = Object.keys(data) as (keyof typeof data)[];
  if (fields.length === 0) return null;
  const setClauses = fields.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = fields.map((k) => data[k]);
  const { rows } = await pool.query<PaymentBank>(
    `UPDATE payment_banks SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return rows[0] ?? null;
}

export async function setBankActive(id: number, is_active: boolean): Promise<PaymentBank | null> {
  const { rows } = await pool.query<PaymentBank>(
    'UPDATE payment_banks SET is_active = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id, is_active]
  );
  return rows[0] ?? null;
}
