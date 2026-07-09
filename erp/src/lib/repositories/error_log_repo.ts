import pool from '@/lib/db';

export interface ErrorLogEntry {
  id: number;
  service: string;
  level: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function logError(
  service: string,
  level: 'error' | 'warn' | 'info',
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `INSERT INTO error_logs (service, level, message, metadata) VALUES ($1, $2, $3, $4)`,
    [service, level, message, metadata ? JSON.stringify(metadata) : null]
  );
}

export async function getErrorLogs(limit = 200): Promise<ErrorLogEntry[]> {
  const { rows } = await pool.query<ErrorLogEntry>(
    `SELECT id, service, level, message, metadata, created_at
     FROM error_logs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function clearErrorLogs(): Promise<{ deleted: number }> {
  const { rowCount } = await pool.query('DELETE FROM error_logs');
  return { deleted: rowCount ?? 0 };
}
