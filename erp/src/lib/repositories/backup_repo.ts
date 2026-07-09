import pool from '@/lib/db';
import path from 'path';

export interface BackupRecord {
  id: number;
  filename: string;
  file_size_bytes: number | null;
  status: 'pending' | 'completed' | 'failed';
  notes: string | null;
  created_at: string;
}

export const BACKUP_DIR = process.env.BACKUP_DIR ?? '/tmp/backups';

export function backupFilePath(filename: string): string {
  return path.join(BACKUP_DIR, filename);
}

export async function listBackups(): Promise<BackupRecord[]> {
  const { rows } = await pool.query<BackupRecord>(
    `SELECT id, filename, file_size_bytes, status, notes, created_at
     FROM system_backups ORDER BY created_at DESC LIMIT 50`
  );
  return rows;
}

export async function getBackup(id: number): Promise<BackupRecord | null> {
  const { rows } = await pool.query<BackupRecord>(
    `SELECT id, filename, file_size_bytes, status, notes, created_at
     FROM system_backups WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function insertBackupRecord(filename: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO system_backups (filename, status) VALUES ($1, 'pending') RETURNING id`,
    [filename]
  );
  return rows[0].id;
}

export async function completeBackupRecord(id: number, fileSizeBytes: number): Promise<void> {
  await pool.query(
    `UPDATE system_backups SET file_size_bytes = $2, status = 'completed' WHERE id = $1`,
    [id, fileSizeBytes]
  );
}

export async function failBackupRecord(id: number, notes: string): Promise<void> {
  await pool.query(
    `UPDATE system_backups SET status = 'failed', notes = $2 WHERE id = $1`,
    [id, notes]
  );
}

export async function getExpiredBackups(retentionDays: number): Promise<{ id: number; filename: string }[]> {
  const { rows } = await pool.query<{ id: number; filename: string }>(
    `SELECT id, filename FROM system_backups
     WHERE created_at < NOW() - ($1 || ' days')::interval
       AND status = 'completed'`,
    [retentionDays]
  );
  return rows;
}

export async function deleteBackupRecord(id: number): Promise<void> {
  await pool.query(`DELETE FROM system_backups WHERE id = $1`, [id]);
}
