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

export interface StaffMember {
  id: number;
  erp_username: string;
  display_name: string | null;
  telegram_id: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
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

const STAFF_COLS = `id, erp_username, display_name, telegram_id, role,
  COALESCE(is_active, true) AS is_active, last_login_at::text,
  added_by_username, created_at::text`;

export async function listStaff(): Promise<StaffMember[]> {
  const r = await pool.query(`SELECT ${STAFF_COLS} FROM admins ORDER BY created_at DESC`);
  return r.rows;
}

export async function getStaffById(id: number): Promise<StaffMember | null> {
  const r = await pool.query(`SELECT ${STAFF_COLS} FROM admins WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function createStaffMember(data: {
  erp_username: string;
  display_name?: string;
  role: string;
  password: string;
  added_by_username: string;
}): Promise<StaffMember> {
  const hash = await bcrypt.hash(data.password, 10);
  const r = await pool.query(
    `INSERT INTO admins (erp_username, display_name, role, erp_password_hash, is_active, added_by_username)
     VALUES ($1, $2, $3, $4, TRUE, $5)
     RETURNING ${STAFF_COLS}`,
    [data.erp_username, data.display_name ?? data.erp_username, data.role, hash, data.added_by_username]
  );
  return r.rows[0];
}

export async function updateStaffMember(
  id: number,
  data: { role?: string; is_active?: boolean; password?: string; display_name?: string }
): Promise<StaffMember | null> {
  const fields: string[] = [];
  const params: unknown[] = [id];
  let i = 2;
  if (data.role !== undefined)         { fields.push(`role = $${i++}`);         params.push(data.role); }
  if (data.is_active !== undefined)    { fields.push(`is_active = $${i++}`);    params.push(data.is_active); }
  if (data.display_name !== undefined) { fields.push(`display_name = $${i++}`); params.push(data.display_name); }
  if (data.password !== undefined) {
    const hash = await bcrypt.hash(data.password, 10);
    fields.push(`erp_password_hash = $${i++}`);
    params.push(hash);
  }
  if (fields.length === 0) return getStaffById(id);
  const r = await pool.query(
    `UPDATE admins SET ${fields.join(', ')} WHERE id = $1 RETURNING ${STAFF_COLS}`,
    params
  );
  return r.rows[0] ?? null;
}

export async function countActiveSuperAdmins(): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM admins WHERE role = 'SUPER_ADMIN' AND is_active = TRUE`
  );
  return r.rows[0]?.n ?? 0;
}
