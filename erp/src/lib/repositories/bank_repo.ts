import pool from '@/lib/db';
import type { PaymentBank } from '@/lib/types';

function isMissingColumnError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as Record<string, unknown>).code === '42703';
}

export async function getAllBanks(): Promise<PaymentBank[]> {
  const { rows } = await pool.query<PaymentBank>(
    'SELECT * FROM payment_banks ORDER BY display_order, id'
  );
  return rows;
}

export async function getActiveBanks(): Promise<PaymentBank[]> {
  const { rows } = await pool.query<PaymentBank>(
    'SELECT * FROM payment_banks WHERE is_active = TRUE ORDER BY display_order, id'
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
  account_name: string;
  qr_image?: string | null;
  qr_media_id?: number | null;
  instructions?: string | null;
  display_order?: number;
  maintenance_mode?: boolean;
  maintenance_message?: string | null;
  provider_binding?: string | null;
  priority?: number;
}): Promise<PaymentBank> {
  // Try new schema (migrations 027+028 applied) then fall back to legacy columns
  // Three-tier INSERT fallback matching payment_banks schema evolution:
  //   Tier 1 (post-028): maintenance_mode + maintenance_message + provider_binding + priority
  //   Tier 2 (post-027): maintenance_mode + maintenance_message present, no provider_binding/priority
  //   Tier 3 (base):     only base columns (no maintenance_mode etc.)
  //
  // qr_media_id and instructions are not real columns — never referenced in INSERT.
  const attempts: Array<{ sql: string; params: unknown[] }> = [
    {
      // Tier 1 (post-028): all migration columns present
      sql: `INSERT INTO payment_banks
              (bank_name, account_number, account_name, qr_image, display_order,
               maintenance_mode, maintenance_message, provider_binding, priority)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
      params: [
        data.bank_name, data.account_number, data.account_name,
        data.qr_image ?? null, data.display_order ?? 0,
        data.maintenance_mode ?? false, data.maintenance_message ?? null,
        data.provider_binding ?? null, data.priority ?? 0,
      ],
    },
    {
      // Tier 2 (post-027): maintenance_mode + maintenance_message, no provider_binding/priority
      sql: `INSERT INTO payment_banks
              (bank_name, account_number, account_name, qr_image, display_order,
               maintenance_mode, maintenance_message)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
      params: [
        data.bank_name, data.account_number, data.account_name,
        data.qr_image ?? null, data.display_order ?? 0,
        data.maintenance_mode ?? false, data.maintenance_message ?? null,
      ],
    },
    {
      // Tier 3 (base): only core columns
      sql: `INSERT INTO payment_banks
              (bank_name, account_number, account_name, qr_image, display_order)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
      params: [
        data.bank_name, data.account_number, data.account_name,
        data.qr_image ?? null, data.display_order ?? 0,
      ],
    },
  ];

  for (const { sql, params } of attempts) {
    try {
      const { rows } = await pool.query<PaymentBank>(sql, params);
      return rows[0];
    } catch (err) {
      if (isMissingColumnError(err)) {
        console.warn('[bank_repo] migration pending, trying legacy INSERT');
        continue;
      }
      throw err;
    }
  }

  throw new Error('createBank: all INSERT attempts failed');
}

export async function updateBank(
  id: number,
  data: Partial<Pick<PaymentBank,
    'bank_name' | 'account_number' | 'account_name' |
    'qr_image' | 'qr_media_id' | 'instructions' | 'display_order' |
    'maintenance_mode' | 'maintenance_message' |
    'provider_binding' | 'priority'>>
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

export async function deleteBank(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'DELETE FROM payment_banks WHERE id = $1',
    [id]
  );
  return (rowCount ?? 0) > 0;
}
