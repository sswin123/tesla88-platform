import pool from '@/lib/db';
import bcrypt from 'bcryptjs';

export interface AdminUser {
  id: number;
  erp_username: string;
  telegram_id: string | null;
  role: string;
  is_active: boolean;
  added_by_username: string | null;
  created_at: string;
}

export async function getAllAdmins(): Promise<AdminUser[]> {
  const r = await pool.query(
    `SELECT id, erp_username, telegram_id, role,
            COALESCE(is_active, true) AS is_active,
            added_by_username, created_at::text
     FROM admins ORDER BY created_at DESC`
  );
  return r.rows;
}

export async function createAdmin(data: {
  erp_username: string;
  telegram_id?: string;
  role: string;
  password: string;
  added_by_username: string;
}): Promise<AdminUser> {
  const hash = await bcrypt.hash(data.password, 10);
  const r = await pool.query(
    `INSERT INTO admins (erp_username, telegram_id, role, erp_password_hash, is_active, added_by_username)
     VALUES ($1, $2, $3, $4, TRUE, $5)
     RETURNING id, erp_username, telegram_id, role, is_active, added_by_username, created_at::text`,
    [data.erp_username, data.telegram_id ?? null, data.role, hash, data.added_by_username]
  );
  return r.rows[0];
}

export async function updateAdmin(
  id: number,
  data: { role?: string; is_active?: boolean }
): Promise<AdminUser | null> {
  const fields: string[] = [];
  const params: unknown[] = [id];
  let i = 2;
  if (data.role !== undefined)      { fields.push(`role = $${i++}`);      params.push(data.role); }
  if (data.is_active !== undefined) { fields.push(`is_active = $${i++}`); params.push(data.is_active); }
  if (fields.length === 0) return null;
  const r = await pool.query(
    `UPDATE admins SET ${fields.join(', ')} WHERE id = $1
     RETURNING id, erp_username, telegram_id, role, is_active, added_by_username, created_at::text`,
    params
  );
  return r.rows[0] ?? null;
}
