import pool from '@/lib/db';
import type { SystemSetting } from '@/lib/types';

export async function getAllSettings(): Promise<SystemSetting[]> {
  const r = await pool.query(
    `SELECT key, value, description, updated_by, updated_at::text FROM system_settings ORDER BY key`
  );
  return r.rows;
}

export async function getSetting(key: string): Promise<string | null> {
  const r = await pool.query(`SELECT value FROM system_settings WHERE key = $1`, [key]);
  return r.rows[0]?.value ?? null;
}

export async function setSettings(updates: Record<string, string>, updatedBy: string): Promise<void> {
  const entries = Object.entries(updates);
  if (entries.length === 0) return;
  // Update each setting — use upsert in case key doesn't exist yet
  for (const [key, value] of entries) {
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
      [key, value, updatedBy]
    );
  }
}
