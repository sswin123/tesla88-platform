import pool from '@/lib/db';
import type { SupportSession, SupportMessage, MemberCardData } from '@/lib/types';

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

// ── LiveChat extensions ───────────────────────────────────────────────────────

export async function getSessionsLiveChat(opts: {
  status?: string;
  search?: string;
  limit: number;
  offset: number;
}): Promise<{ sessions: SupportSession[]; total: number }> {
  const conditions: string[] = ['1=1'];
  const params: (string | number)[] = [opts.limit, opts.offset];
  let pIdx = 3;

  if (opts.status) {
    conditions.push(`ss.status = $${pIdx++}`);
    params.push(opts.status);
  }
  if (opts.search) {
    conditions.push(
      `(u.first_name ILIKE $${pIdx} OR u.telegram_username ILIKE $${pIdx} OR u.id::text = $${pIdx + 1})`
    );
    params.push(`%${opts.search}%`, opts.search);
    pIdx += 2;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const lastMsgSub = `(
    SELECT content FROM support_messages
    WHERE session_id = ss.id
    ORDER BY created_at DESC LIMIT 1
  )`;
  const lastMsgTypeSub = `(
    SELECT message_type FROM support_messages
    WHERE session_id = ss.id
    ORDER BY created_at DESC LIMIT 1
  )`;

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT ss.*,
              u.first_name, u.phone, u.telegram_id, u.telegram_username,
              ${lastMsgSub} AS last_message_content,
              ${lastMsgTypeSub} AS last_message_type
       FROM support_sessions ss
       JOIN users u ON u.id = ss.user_id
       ${where}
       ORDER BY ss.pinned_at DESC NULLS LAST, ss.last_message_at DESC
       LIMIT $1 OFFSET $2`,
      params
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM support_sessions ss
       JOIN users u ON u.id = ss.user_id
       ${where}`,
      params.slice(2)
    ),
  ]);

  return { sessions: rows.rows as SupportSession[], total: count.rows[0].count };
}

export async function getSessionWithDetails(id: number): Promise<{
  session: SupportSession;
  messages: SupportMessage[];
  member: MemberCardData;
} | null> {
  const [sessionRows, messageRows] = await Promise.all([
    pool.query(
      `SELECT ss.*,
              u.first_name, u.phone, u.telegram_id, u.telegram_username,
              u.status AS member_status, u.created_at AS member_created_at,
              u.total_deposit, u.total_withdraw, u.total_bonus,
              u.bank_name, u.bank_account, u.bank_holder_name
       FROM support_sessions ss
       JOIN users u ON u.id = ss.user_id
       WHERE ss.id = $1`,
      [id]
    ),
    pool.query<SupportMessage>(
      `SELECT id, session_id, sender_type, message_type, content,
              user_msg_id, group_msg_id, created_at
       FROM support_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [id]
    ),
  ]);

  if (!sessionRows.rows[0]) return null;
  const row = sessionRows.rows[0];

  const session: SupportSession = {
    id: row.id,
    user_id: row.user_id,
    agent_id: row.agent_id,
    agent_username: row.agent_username,
    assigned_to_username: row.assigned_to_username,
    status: row.status,
    erp_unread_count: row.erp_unread_count,
    pinned_at: row.pinned_at,
    last_message_at: row.last_message_at,
    created_at: row.created_at,
    accepted_at: row.accepted_at,
    closed_at: row.closed_at,
    close_reason: row.close_reason,
    first_name: row.first_name,
    phone: row.phone,
    telegram_id: row.telegram_id,
    telegram_username: row.telegram_username,
  };

  const member: MemberCardData = {
    id: row.user_id,
    first_name: row.first_name,
    telegram_id: row.telegram_id,
    telegram_username: row.telegram_username,
    phone: row.phone,
    status: row.member_status,
    created_at: row.member_created_at,
    total_deposit: row.total_deposit ?? '0',
    total_withdraw: row.total_withdraw ?? '0',
    total_bonus: row.total_bonus ?? '0',
    bank_name: row.bank_name ?? '',
    bank_account: row.bank_account ?? '',
    bank_holder_name: row.bank_holder_name ?? '',
  };

  return { session, messages: messageRows.rows, member };
}

export async function updateSessionAction(
  id: number,
  action: string,
  username?: string
): Promise<SupportSession | null> {
  let sql: string;
  const params: (string | number | null)[] = [id];

  if (action === 'close') {
    sql = `UPDATE support_sessions
           SET status='CLOSED', close_reason='AGENT', closed_at=NOW()
           WHERE id=$1 RETURNING *`;
  } else if (action === 'reopen') {
    sql = `UPDATE support_sessions
           SET status='OPEN', closed_at=NULL, close_reason=NULL
           WHERE id=$1 RETURNING *`;
  } else if (action === 'pin') {
    sql = `UPDATE support_sessions SET pinned_at=NOW() WHERE id=$1 RETURNING *`;
  } else if (action === 'unpin') {
    sql = `UPDATE support_sessions SET pinned_at=NULL WHERE id=$1 RETURNING *`;
  } else if (action === 'assign') {
    params.push(username ?? null);
    sql = `UPDATE support_sessions SET assigned_to_username=$2 WHERE id=$1 RETURNING *`;
  } else if (action === 'mark_unread') {
    sql = `UPDATE support_sessions SET erp_unread_count=erp_unread_count+1 WHERE id=$1 RETURNING *`;
  } else if (action === 'reset_unread') {
    sql = `UPDATE support_sessions SET erp_unread_count=0 WHERE id=$1 RETURNING *`;
  } else {
    return null;
  }

  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
}

export async function getMoreMessages(
  sessionId: number,
  beforeId: number,
  limit = 50
): Promise<SupportMessage[]> {
  const { rows } = await pool.query<SupportMessage>(
    `SELECT id, session_id, sender_type, message_type, content,
            user_msg_id, group_msg_id, created_at
     FROM support_messages
     WHERE session_id = $1 AND id < $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [sessionId, beforeId, limit]
  );
  return rows.reverse();
}
