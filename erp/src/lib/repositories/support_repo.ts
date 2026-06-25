import pool from '@/lib/db';
import type { SupportSession, SupportMessage, MemberCardData, QuickReply, QuickReplyCategory } from '@/lib/types';

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
  // Main query params: $1=limit, $2=offset, then filters
  const mainConditions: string[] = ['1=1'];
  const mainParams: (string | number)[] = [opts.limit, opts.offset];
  let pIdx = 3;

  // Count query params: $1, $2, ... (no limit/offset prefix)
  const countConditions: string[] = ['1=1'];
  const countParams: (string | number)[] = [];
  let cIdx = 1;

  if (opts.status) {
    mainConditions.push(`ss.status = $${pIdx++}`);
    mainParams.push(opts.status);
    countConditions.push(`ss.status = $${cIdx++}`);
    countParams.push(opts.status);
  }
  if (opts.search) {
    mainConditions.push(
      `(u.first_name ILIKE $${pIdx} OR u.telegram_username ILIKE $${pIdx} OR u.id::text = $${pIdx + 1})`
    );
    mainParams.push(`%${opts.search}%`, opts.search);
    pIdx += 2;

    countConditions.push(
      `(u.first_name ILIKE $${cIdx} OR u.telegram_username ILIKE $${cIdx} OR u.id::text = $${cIdx + 1})`
    );
    countParams.push(`%${opts.search}%`, opts.search);
    cIdx += 2;
  }

  const mainWhere = `WHERE ${mainConditions.join(' AND ')}`;
  const countWhere = `WHERE ${countConditions.join(' AND ')}`;

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
       ${mainWhere}
       ORDER BY ss.pinned_at DESC NULLS LAST, ss.last_message_at DESC
       LIMIT $1 OFFSET $2`,
      mainParams
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM support_sessions ss
       JOIN users u ON u.id = ss.user_id
       ${countWhere}`,
      countParams
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
      `SELECT id, session_id, sender_type, message_type, content, caption,
              user_msg_id, group_msg_id, created_at
       FROM support_messages
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
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

  return { session, messages: messageRows.rows.reverse(), member };
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
    `SELECT id, session_id, sender_type, message_type, content, caption,
            user_msg_id, group_msg_id, created_at
     FROM support_messages
     WHERE session_id = $1 AND id < $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [sessionId, beforeId, limit]
  );
  return rows.reverse();
}

// ── Quick Replies ─────────────────────────────────────────────────────────────

export async function getQuickReplies(adminUsername: string): Promise<QuickReply[]> {
  const { rows } = await pool.query(
    `SELECT qr.id, qr.category_id, qrc.name AS category_name, qr.title, qr.body, qr.sort_order,
            (qrf.admin_username IS NOT NULL) AS is_favorite, qr.created_at
     FROM quick_replies qr
     LEFT JOIN quick_reply_categories qrc ON qrc.id = qr.category_id
     LEFT JOIN quick_reply_favorites qrf ON qrf.reply_id = qr.id AND qrf.admin_username = $1
     ORDER BY qrc.sort_order NULLS LAST, qr.sort_order, qr.id`,
    [adminUsername]
  );
  return rows;
}

export async function getQuickReplyCategories(): Promise<QuickReplyCategory[]> {
  const { rows } = await pool.query(
    `SELECT id, name, sort_order FROM quick_reply_categories ORDER BY sort_order`
  );
  return rows;
}

export async function createQuickReply(data: {
  category_id: number | null;
  title: string;
  body: string;
  sort_order: number;
  created_by: string;
}): Promise<QuickReply> {
  const { rows } = await pool.query(
    `INSERT INTO quick_replies (category_id, title, body, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, category_id, NULL AS category_name, title, body, sort_order, FALSE AS is_favorite, created_at`,
    [data.category_id, data.title, data.body, data.sort_order, data.created_by]
  );
  return rows[0];
}

export async function updateQuickReply(
  id: number,
  data: { category_id?: number | null; title?: string; body?: string; sort_order?: number }
): Promise<QuickReply | null> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  let i = 1;
  if ('category_id' in data) { sets.push(`category_id=$${i++}`); params.push(data.category_id ?? null); }
  if (data.title !== undefined) { sets.push(`title=$${i++}`); params.push(data.title); }
  if (data.body !== undefined)  { sets.push(`body=$${i++}`);  params.push(data.body); }
  if (data.sort_order !== undefined) { sets.push(`sort_order=$${i++}`); params.push(data.sort_order); }
  if (!sets.length) return null;
  params.push(id);
  const { rows } = await pool.query(
    `UPDATE quick_replies SET ${sets.join(', ')} WHERE id=$${i}
     RETURNING id, category_id, NULL AS category_name, title, body, sort_order, FALSE AS is_favorite, created_at`,
    params
  );
  return rows[0] ?? null;
}

export async function deleteQuickReply(id: number): Promise<void> {
  await pool.query(`DELETE FROM quick_replies WHERE id=$1`, [id]);
}

export async function toggleFavoriteQuickReply(
  adminUsername: string,
  replyId: number,
  isFavorite: boolean
): Promise<void> {
  if (isFavorite) {
    await pool.query(
      `INSERT INTO quick_reply_favorites (admin_username, reply_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [adminUsername, replyId]
    );
  } else {
    await pool.query(
      `DELETE FROM quick_reply_favorites WHERE admin_username=$1 AND reply_id=$2`,
      [adminUsername, replyId]
    );
  }
}
