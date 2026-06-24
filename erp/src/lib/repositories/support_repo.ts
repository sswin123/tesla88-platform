import pool from '@/lib/db';
import type { SupportSession, SupportMessage } from '@/lib/types';

export async function getSessions(options: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ sessions: SupportSession[]; total: number }> {
  const limit  = options.limit  ?? 20;
  const offset = options.offset ?? 0;

  const where = options.status ? `WHERE ss.status = $3` : '';
  const params: (string | number)[] = [limit, offset];
  if (options.status) params.push(options.status);

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT ss.*, u.first_name, u.phone, u.telegram_id
       FROM support_sessions ss
       JOIN users u ON u.id = ss.user_id
       ${where}
       ORDER BY ss.last_message_at DESC
       LIMIT $1 OFFSET $2`,
      params
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM support_sessions ss ${where}`,
      options.status ? [options.status] : []
    ),
  ]);

  return { sessions: rows.rows, total: count.rows[0].count };
}

export async function getSessionById(id: number): Promise<SupportSession | null> {
  const { rows } = await pool.query(
    `SELECT ss.*, u.first_name, u.phone, u.telegram_id
     FROM support_sessions ss
     JOIN users u ON u.id = ss.user_id
     WHERE ss.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getSessionMessages(sessionId: number): Promise<SupportMessage[]> {
  const { rows } = await pool.query<SupportMessage>(
    `SELECT id, session_id, sender_type, message_type, content, created_at
     FROM support_messages
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );
  return rows;
}

export async function getSessionStats(): Promise<{ open: number; active: number; closed_today: number }> {
  const { rows } = await pool.query<{ status: string; count: number }>(
    `SELECT status, COUNT(*)::int AS count FROM support_sessions GROUP BY status`
  );
  const map = Object.fromEntries(rows.map((r) => [r.status, r.count]));

  const { rows: todayRows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM support_sessions
     WHERE status = 'CLOSED' AND closed_at::date = CURRENT_DATE`
  );

  return {
    open:         map['OPEN']   ?? 0,
    active:       map['ACTIVE'] ?? 0,
    closed_today: todayRows[0].count,
  };
}
