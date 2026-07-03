import pool from '@/lib/db';
import type { SupportSession, SupportMessage, MemberCardData, QuickReply, QuickReplyCategory, SessionNote, CustomerTag } from '@/lib/types';
// Note: MediaRecord, MediaModule, MediaType, ThumbnailStatus, QuickReplyContentType imported inline in Quick Replies section

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
  assignedToMe?: string;
  unassigned?: boolean;
  unread?: boolean;
  today?: boolean;
  lastWeek?: boolean;
  vip?: boolean;
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
      `(u.first_name ILIKE $${pIdx} OR u.telegram_username ILIKE $${pIdx} OR u.phone ILIKE $${pIdx} OR u.id::text = $${pIdx + 1} OR ss.id::text = $${pIdx + 1})`
    );
    mainParams.push(`%${opts.search}%`, opts.search);
    pIdx += 2;

    countConditions.push(
      `(u.first_name ILIKE $${cIdx} OR u.telegram_username ILIKE $${cIdx} OR u.phone ILIKE $${cIdx} OR u.id::text = $${cIdx + 1} OR ss.id::text = $${cIdx + 1})`
    );
    countParams.push(`%${opts.search}%`, opts.search);
    cIdx += 2;
  }
  if (opts.assignedToMe) {
    mainConditions.push(`ss.assigned_to_username = $${pIdx++}`);
    mainParams.push(opts.assignedToMe);
    countConditions.push(`ss.assigned_to_username = $${cIdx++}`);
    countParams.push(opts.assignedToMe);
  }
  if (opts.unassigned) {
    mainConditions.push(`ss.assigned_to_username IS NULL`);
    countConditions.push(`ss.assigned_to_username IS NULL`);
  }
  if (opts.unread) {
    mainConditions.push(`ss.erp_unread_count > 0`);
    countConditions.push(`ss.erp_unread_count > 0`);
  }
  if (opts.today) {
    mainConditions.push(`ss.created_at::date = CURRENT_DATE`);
    countConditions.push(`ss.created_at::date = CURRENT_DATE`);
  }
  if (opts.lastWeek) {
    mainConditions.push(`ss.created_at >= NOW() - INTERVAL '7 days'`);
    countConditions.push(`ss.created_at >= NOW() - INTERVAL '7 days'`);
  }
  if (opts.vip) {
    mainConditions.push(`EXISTS (
    SELECT 1 FROM user_tag_assignments uta
    JOIN customer_tags ct ON ct.id = uta.tag_id
    WHERE uta.user_id = ss.user_id AND ct.name = 'VIP'
  )`);
    countConditions.push(`EXISTS (
    SELECT 1 FROM user_tag_assignments uta
    JOIN customer_tags ct ON ct.id = uta.tag_id
    WHERE uta.user_id = ss.user_id AND ct.name = 'VIP'
  )`);
  }

  const mainWhere = `WHERE ${mainConditions.join(' AND ')}`;
  const countWhere = `WHERE ${countConditions.join(' AND ')}`;

  // One conversation row per customer: DISTINCT ON picks the most recently
  // active session for each user_id; outer query re-orders by pinned/activity.
  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT sub.*
       FROM (
         SELECT DISTINCT ON (ss.user_id)
           ss.*,
           u.first_name, u.phone, u.telegram_id, u.telegram_username,
           (SELECT content      FROM support_messages WHERE session_id = ss.id ORDER BY created_at DESC LIMIT 1) AS last_message_content,
           (SELECT message_type FROM support_messages WHERE session_id = ss.id ORDER BY created_at DESC LIMIT 1) AS last_message_type
         FROM support_sessions ss
         JOIN users u ON u.id = ss.user_id
         ${mainWhere}
         ORDER BY ss.user_id, ss.last_message_at DESC NULLS LAST
       ) sub
       ORDER BY sub.pinned_at DESC NULLS LAST, sub.last_message_at DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      mainParams
    ),
    pool.query<{ count: number }>(
      `SELECT COUNT(DISTINCT ss.user_id)::int AS count
       FROM support_sessions ss
       JOIN users u ON u.id = ss.user_id
       ${countWhere}`,
      countParams
    ),
  ]);

  const sessions = rows.rows as SupportSession[];

  // Batch-load tags for all sessions (avoid N+1)
  const userIds = sessions.map((s) => s.user_id);
  if (userIds.length > 0) {
    const tagRows = await pool.query<{ user_id: number; id: number; name: string; color: string; created_at: string }>(
      `SELECT uta.user_id, ct.id, ct.name, ct.color, ct.created_at
       FROM user_tag_assignments uta
       JOIN customer_tags ct ON ct.id = uta.tag_id
       WHERE uta.user_id = ANY($1::int[])
       ORDER BY ct.name`,
      [userIds]
    );
    const tagsByUser = new Map<number, CustomerTag[]>();
    for (const tr of tagRows.rows) {
      const existing = tagsByUser.get(tr.user_id) ?? [];
      existing.push({ id: tr.id, name: tr.name, color: tr.color, created_at: tr.created_at });
      tagsByUser.set(tr.user_id, existing);
    }
    for (const s of sessions) {
      s.tags = tagsByUser.get(s.user_id) ?? [];
    }
  }

  return { sessions, total: count.rows[0].count };
}

export async function getSessionWithDetails(id: number): Promise<{
  session: SupportSession;
  messages: SupportMessage[];
  member: MemberCardData;
  hasMore: boolean;
} | null> {
  const [sessionRows] = await Promise.all([
    pool.query(
      `SELECT ss.*,
              u.first_name, u.phone, u.telegram_id, u.telegram_username,
              u.status AS member_status, u.created_at AS member_created_at,
              u.total_deposit, u.total_withdraw, u.total_bonus,
              u.net_deposit, u.last_seen_at,
              u.bank_name, u.bank_account, u.bank_holder_name
       FROM support_sessions ss
       JOIN users u ON u.id = ss.user_id
       WHERE ss.id = $1`,
      [id]
    ),
  ]);

  if (!sessionRows.rows[0]) return null;
  const row = sessionRows.rows[0];

  const userId = row.user_id as number;

  const [gameRows, lastDepRow, lastWithdrawRow, promoRow, allSessionRows, tagsResult, messageRows] = await Promise.all([
    pool.query(
      `SELECT ap.provider, ap.username
       FROM user_game_accounts uga
       JOIN account_pool ap ON ap.id = uga.account_pool_id
       WHERE uga.user_id = $1
       ORDER BY ap.provider`,
      [userId]
    ),
    pool.query(
      `SELECT created_at::text AS last_at, deposit_amount::text AS last_amount
       FROM deposit_requests
       WHERE user_id = $1 AND status = 'APPROVED'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    ),
    pool.query(
      `SELECT created_at::text AS last_at, withdraw_amount::text AS last_amount
       FROM withdrawal_requests
       WHERE user_id = $1 AND status = 'PAID'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    ),
    pool.query(
      `SELECT p.name, bc.bonus_amount::text, bc.status
       FROM bonus_claims bc
       JOIN promotions p ON p.id = bc.promotion_id
       WHERE bc.user_id = $1 AND bc.status = 'ACTIVE'
       ORDER BY bc.claimed_at DESC LIMIT 1`,
      [userId]
    ),
    pool.query(
      `SELECT id, status, created_at, closed_at, assigned_to_username
       FROM support_sessions
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId]
    ),
    getTagsForUser(userId),
    pool.query<SupportMessage>(
      `SELECT id, session_id, sender_type, message_type, content, caption,
              file_name, file_size, user_msg_id, group_msg_id, created_at,
              reply_to_message_id, reply_to_content, reply_to_sender_type, status
       FROM support_messages
       WHERE session_id IN (SELECT id FROM support_sessions WHERE user_id = $1)
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [userId]
    ),
  ]);

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
    id: userId,
    first_name: row.first_name,
    telegram_id: row.telegram_id,
    telegram_username: row.telegram_username,
    phone: row.phone,
    status: row.member_status,
    created_at: row.member_created_at,
    last_seen_at: row.last_seen_at ?? null,
    total_deposit: row.total_deposit ?? '0',
    total_withdraw: row.total_withdraw ?? '0',
    total_bonus: row.total_bonus ?? '0',
    net_deposit: row.net_deposit ?? '0',
    last_deposit_at: lastDepRow.rows[0]?.last_at ?? null,
    last_deposit_amount: lastDepRow.rows[0]?.last_amount ?? null,
    last_withdrawal_at: lastWithdrawRow.rows[0]?.last_at ?? null,
    last_withdrawal_amount: lastWithdrawRow.rows[0]?.last_amount ?? null,
    bank_name: row.bank_name ?? '',
    bank_account: row.bank_account ?? '',
    bank_holder_name: row.bank_holder_name ?? '',
    game_accounts: gameRows.rows,
    current_promotion: promoRow.rows[0] ? {
      name: promoRow.rows[0].name,
      bonus_amount: promoRow.rows[0].bonus_amount,
      status: promoRow.rows[0].status,
    } : null,
    previous_sessions: allSessionRows.rows,
    tags: tagsResult,
  };

  const messages = (messageRows.rows as SupportMessage[]).reverse();
  const hasMore = messages.length >= 100;
  return { session, messages, member, hasMore };
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
           SET status='OPEN', closed_at=NULL, close_reason=NULL,
               assigned_to_username=NULL, erp_unread_count=0,
               last_message_at=NOW()
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

export async function createSessionForUser(
  userId: number,
  agentUsername: string | null
): Promise<SupportSession> {
  // Close any existing OPEN/ACTIVE session before opening a new one so the
  // partial unique index (support_sessions_one_active_per_user) is satisfied.
  await pool.query(
    `UPDATE support_sessions
     SET status = 'CLOSED', closed_at = NOW(), close_reason = 'AGENT'
     WHERE user_id = $1 AND status IN ('OPEN', 'ACTIVE')`,
    [userId]
  );
  const { rows } = await pool.query(
    `INSERT INTO support_sessions
       (user_id, status, last_message_at, assigned_to_username)
     VALUES ($1, 'ACTIVE', NOW(), $2)
     RETURNING *`,
    [userId, agentUsername]
  );
  return rows[0];
}

export async function getMoreMessages(
  sessionId: number,
  beforeId: number,
  limit = 50
): Promise<SupportMessage[]> {
  const { rows } = await pool.query<SupportMessage>(
    `SELECT id, session_id, sender_type, message_type, content, caption,
            file_name, file_size, user_msg_id, group_msg_id, created_at,
            reply_to_message_id, reply_to_content, reply_to_sender_type, status
     FROM support_messages
     WHERE session_id = $1 AND id < $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [sessionId, beforeId, limit]
  );
  return rows.reverse();
}

export async function getTimelineMessages(
  userId: number,
  beforeId: number = 2147483647,
  limit: number = 100
): Promise<SupportMessage[]> {
  const { rows } = await pool.query<SupportMessage>(
    `SELECT id, session_id, sender_type, message_type, content, caption,
            file_name, file_size, user_msg_id, group_msg_id, created_at,
            reply_to_message_id, reply_to_content, reply_to_sender_type, status
     FROM support_messages
     WHERE session_id IN (SELECT id FROM support_sessions WHERE user_id = $1)
       AND id < $2
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [userId, beforeId, limit]
  );
  return rows.reverse();  // oldest-first for display
}

// ── Quick Replies ─────────────────────────────────────────────────────────────

import type { MediaRecord, MediaModule, MediaType, ThumbnailStatus } from '@/lib/media/types';
import type { QuickReplyContentType } from '@/lib/types';

// Converts a joined media_library row (prefixed ml_*) to MediaRecord.
// Returns undefined if ml_id is null (no joined media).
function mediaFromRow(row: Record<string, unknown>): MediaRecord | undefined {
  if (row.ml_id == null) return undefined;
  return {
    id:               row.ml_id as number,
    tenantId:         row.ml_tenant_id as number | null,
    fileHash:         row.ml_file_hash as string,
    storageKey:       row.ml_storage_key as string,
    storageProvider:  row.ml_storage_provider as string,
    mediaType:        row.ml_media_type as MediaType,
    mimeType:         row.ml_mime_type as string,
    extension:        row.ml_extension as string,
    originalFilename: row.ml_original_filename as string,
    displayName:      row.ml_display_name as string,
    fileSize:         Number(row.ml_file_size),
    width:            row.ml_width != null ? Number(row.ml_width) : null,
    height:           row.ml_height != null ? Number(row.ml_height) : null,
    duration:         row.ml_duration != null ? Number(row.ml_duration) : null,
    thumbnailKey:     row.ml_thumbnail_key as string | null,
    thumbnailStatus:  row.ml_thumbnail_status as ThumbnailStatus,
    metadata:         (row.ml_metadata ?? {}) as Record<string, unknown>,
    usageCount:       Number(row.ml_usage_count ?? 0),
    referenceCount:   Number(row.ml_reference_count ?? 0),
    lastUsedAt:       row.ml_last_used_at as string | null,
    lastUsedModule:   row.ml_last_used_module as MediaModule | null,
    downloadCount:    Number(row.ml_download_count ?? 0),
    lastDownloadedAt: row.ml_last_downloaded_at as string | null,
    createdBy:        row.ml_created_by != null ? Number(row.ml_created_by) : null,
    createdAt:        row.ml_created_at as string,
    updatedAt:        row.ml_updated_at as string,
    isActive:         row.ml_is_active as boolean,
    deletedAt:        row.ml_deleted_at as string | null,
    deletedBy:        row.ml_deleted_by != null ? Number(row.ml_deleted_by) : null,
  };
}

// Columns from quick_replies (no media_content — excluded for payload size)
const QR_COLS = `
  qr.id, qr.category_id, qrc.name AS category_name,
  qr.title, qr.body, qr.caption, qr.content_type, qr.media_id,
  qr.is_active, qr.sort_order, qr.pinned,
  qr.archived_at, qr.archived_by,
  qr.usage_count, qr.last_used_at, qr.used_by,
  qr.created_by, qr.created_at, qr.updated_by, qr.updated_at`;

// Columns from media_library joined as ml_* aliases
const ML_COLS = `
  ml.id              AS ml_id,
  ml.tenant_id       AS ml_tenant_id,
  ml.file_hash       AS ml_file_hash,
  ml.storage_key     AS ml_storage_key,
  ml.storage_provider AS ml_storage_provider,
  ml.media_type      AS ml_media_type,
  ml.mime_type       AS ml_mime_type,
  ml.extension       AS ml_extension,
  ml.original_filename AS ml_original_filename,
  ml.display_name    AS ml_display_name,
  ml.file_size       AS ml_file_size,
  ml.width           AS ml_width,
  ml.height          AS ml_height,
  ml.duration        AS ml_duration,
  ml.thumbnail_key   AS ml_thumbnail_key,
  ml.thumbnail_status AS ml_thumbnail_status,
  ml.metadata        AS ml_metadata,
  ml.usage_count     AS ml_usage_count,
  ml.reference_count AS ml_reference_count,
  ml.last_used_at    AS ml_last_used_at,
  ml.last_used_module AS ml_last_used_module,
  ml.download_count  AS ml_download_count,
  ml.last_downloaded_at AS ml_last_downloaded_at,
  ml.created_by      AS ml_created_by,
  ml.created_at      AS ml_created_at,
  ml.updated_at      AS ml_updated_at,
  ml.is_active       AS ml_is_active,
  ml.deleted_at      AS ml_deleted_at,
  ml.deleted_by      AS ml_deleted_by`;

function qrFromRow(row: Record<string, unknown>, isFavorite = false): QuickReply {
  return {
    id:            row.id as number,
    category_id:   row.category_id as number | null,
    category_name: row.category_name as string | null,
    title:         row.title as string,
    body:          row.body as string,
    caption:       row.caption as string | null,
    content_type:  row.content_type as QuickReplyContentType,
    media_id:      row.media_id as number | null,
    media:         mediaFromRow(row),
    is_active:     row.is_active as boolean,
    sort_order:    row.sort_order as number,
    is_favorite:   row.is_favorite != null ? Boolean(row.is_favorite) : isFavorite,
    pinned:        Boolean(row.pinned),
    archived_at:   row.archived_at as string | null,
    archived_by:   row.archived_by as string | null,
    usage_count:   Number(row.usage_count ?? 0),
    last_used_at:  row.last_used_at as string | null,
    used_by:       row.used_by as string | null,
    created_by:    row.created_by as string | null,
    created_at:    row.created_at as string,
    updated_by:    row.updated_by as string | null,
    updated_at:    row.updated_at as string,
  };
}

async function incRefCount(mediaId: number): Promise<void> {
  await pool.query(
    `UPDATE media_library SET reference_count = reference_count + 1 WHERE id = $1`,
    [mediaId]
  );
}

async function decRefCount(mediaId: number): Promise<void> {
  await pool.query(
    `UPDATE media_library SET reference_count = GREATEST(0, reference_count - 1) WHERE id = $1`,
    [mediaId]
  );
}

// 1. For ReplyBox picker (active + non-archived only)
export async function getQuickReplies(adminUsername: string): Promise<QuickReply[]> {
  const { rows } = await pool.query(
    `SELECT ${QR_COLS},
            (qrf.admin_username IS NOT NULL) AS is_favorite,
            ${ML_COLS}
     FROM quick_replies qr
     LEFT JOIN quick_reply_categories qrc ON qrc.id = qr.category_id
     LEFT JOIN quick_reply_favorites  qrf ON qrf.reply_id = qr.id AND qrf.admin_username = $1
     LEFT JOIN media_library ml           ON ml.id = qr.media_id AND ml.deleted_at IS NULL
     WHERE qr.is_active = TRUE AND qr.archived_at IS NULL
     ORDER BY qr.pinned DESC, qrc.sort_order NULLS LAST, qr.sort_order, qr.id`,
    [adminUsername]
  );
  return rows.map(r => qrFromRow(r as Record<string, unknown>));
}

// 2. Admin list (manager page)
export async function getAllQuickRepliesAdmin(opts?: {
  includeArchived?: boolean;
}): Promise<QuickReply[]> {
  const includeArchived = opts?.includeArchived ?? false;
  const whereClause = includeArchived
    ? `WHERE qr.archived_at IS NOT NULL`
    : `WHERE qr.archived_at IS NULL`;
  const { rows } = await pool.query(
    `SELECT ${QR_COLS},
            FALSE AS is_favorite,
            ${ML_COLS}
     FROM quick_replies qr
     LEFT JOIN quick_reply_categories qrc ON qrc.id = qr.category_id
     LEFT JOIN media_library ml           ON ml.id = qr.media_id AND ml.deleted_at IS NULL
     ${whereClause}
     ORDER BY qr.pinned DESC, qrc.sort_order NULLS LAST, qr.sort_order, qr.id`
  );
  return rows.map(r => qrFromRow(r as Record<string, unknown>));
}

// 3. Single by ID (relay send path — keep media_content for Phase 5.4D)
export async function getQuickReplyById(
  id: number
): Promise<(QuickReply & { media_content: string | null }) | null> {
  const { rows } = await pool.query(
    `SELECT ${QR_COLS},
            FALSE AS is_favorite,
            qr.media_content,
            ${ML_COLS}
     FROM quick_replies qr
     LEFT JOIN quick_reply_categories qrc ON qrc.id = qr.category_id
     LEFT JOIN media_library ml           ON ml.id = qr.media_id AND ml.deleted_at IS NULL
     WHERE qr.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    ...qrFromRow(row),
    media_content: row.media_content as string | null,
  };
}

// 4. Categories
export async function getQuickReplyCategories(): Promise<QuickReplyCategory[]> {
  const { rows } = await pool.query(
    `SELECT id, name, sort_order FROM quick_reply_categories ORDER BY sort_order`
  );
  return rows;
}

// 5. Create
export async function createQuickReply(data: {
  category_id: number | null;
  title: string;
  body: string;
  caption: string | null;
  content_type: QuickReplyContentType;
  media_id: number | null;
  sort_order: number;
  created_by: string;
}): Promise<QuickReply> {
  const { rows } = await pool.query(
    `INSERT INTO quick_replies
       (category_id, title, body, caption, content_type, media_id, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, category_id, NULL AS category_name,
               title, body, caption, content_type, media_id,
               is_active, sort_order, pinned,
               archived_at, archived_by,
               usage_count, last_used_at, used_by,
               created_by, created_at, updated_by, updated_at,
               FALSE AS is_favorite`,
    [data.category_id, data.title, data.body, data.caption,
     data.content_type, data.media_id, data.sort_order, data.created_by]
  );
  const row = rows[0] as Record<string, unknown>;
  if (data.media_id) await incRefCount(data.media_id);
  return qrFromRow(row);
}

// 6. Update (dynamic SET)
export async function updateQuickReply(
  id: number,
  data: {
    category_id?: number | null;
    title?: string;
    body?: string;
    caption?: string | null;
    sort_order?: number;
    is_active?: boolean;
    content_type?: QuickReplyContentType;
    media_id?: number | null;
  },
  updatedBy?: string
): Promise<QuickReply | null> {
  // Fetch current media_id to compute reference_count delta
  const current = await pool.query<{ media_id: number | null }>(
    `SELECT media_id FROM quick_replies WHERE id = $1`, [id]
  );
  if (!current.rows[0]) return null;
  const oldMediaId = current.rows[0].media_id;

  const sets: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  let i = 1;
  if ('category_id'    in data) { sets.push(`category_id=$${i++}`);   params.push(data.category_id ?? null); }
  if (data.title       !== undefined) { sets.push(`title=$${i++}`);    params.push(data.title); }
  if (data.body        !== undefined) { sets.push(`body=$${i++}`);     params.push(data.body); }
  if ('caption'        in data) { sets.push(`caption=$${i++}`);        params.push(data.caption ?? null); }
  if (data.sort_order  !== undefined) { sets.push(`sort_order=$${i++}`); params.push(data.sort_order); }
  if (data.is_active   !== undefined) { sets.push(`is_active=$${i++}`); params.push(data.is_active); }
  if (data.content_type !== undefined) { sets.push(`content_type=$${i++}`); params.push(data.content_type); }
  if ('media_id'       in data) { sets.push(`media_id=$${i++}`);       params.push(data.media_id ?? null); }
  if (updatedBy !== undefined) { sets.push(`updated_by=$${i++}`);      params.push(updatedBy); }

  if (!sets.length) return null;

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE quick_replies SET ${sets.join(', ')} WHERE id=$${i}
     RETURNING id, category_id, NULL AS category_name,
               title, body, caption, content_type, media_id,
               is_active, sort_order, pinned,
               archived_at, archived_by,
               usage_count, last_used_at, used_by,
               created_by, created_at, updated_by, updated_at,
               FALSE AS is_favorite`,
    params
  );
  if (!rows[0]) return null;

  // Handle reference_count changes
  if ('media_id' in data) {
    const newMediaId = data.media_id ?? null;
    if (oldMediaId !== newMediaId) {
      if (oldMediaId) await decRefCount(oldMediaId);
      if (newMediaId) await incRefCount(newMediaId);
    }
  }

  return qrFromRow(rows[0] as Record<string, unknown>);
}

// 7. Delete
export async function deleteQuickReply(id: number): Promise<void> {
  const current = await pool.query<{ media_id: number | null }>(
    `SELECT media_id FROM quick_replies WHERE id = $1`, [id]
  );
  const mediaId = current.rows[0]?.media_id ?? null;
  await pool.query(`DELETE FROM quick_replies WHERE id = $1`, [id]);
  if (mediaId) await decRefCount(mediaId);
}

// 8. Archive (soft hide — sets archived_at, archived_by)
export async function archiveQuickReply(id: number, archivedBy: string): Promise<void> {
  await pool.query(
    `UPDATE quick_replies SET archived_at = NOW(), archived_by = $2 WHERE id = $1`,
    [id, archivedBy]
  );
}

// 9. Restore (clear archived_at, archived_by)
export async function restoreQuickReply(id: number): Promise<void> {
  await pool.query(
    `UPDATE quick_replies SET archived_at = NULL, archived_by = NULL WHERE id = $1`,
    [id]
  );
}

// 10. Duplicate (copy everything except id/created_at/usage stats)
export async function duplicateQuickReply(id: number, createdBy: string): Promise<QuickReply | null> {
  const src = await pool.query<{
    category_id: number | null;
    title: string;
    body: string;
    caption: string | null;
    content_type: string;
    media_id: number | null;
    sort_order: number;
    is_active: boolean;
  }>(
    `SELECT category_id, title, body, caption, content_type, media_id, sort_order, is_active
     FROM quick_replies WHERE id = $1`,
    [id]
  );
  if (!src.rows[0]) return null;
  const s = src.rows[0];
  const { rows } = await pool.query(
    `INSERT INTO quick_replies
       (category_id, title, body, caption, content_type, media_id, sort_order, is_active,
        created_by, usage_count, last_used_at, used_by, pinned, archived_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, NULL, NULL, FALSE, NULL)
     RETURNING id, category_id, NULL AS category_name,
               title, body, caption, content_type, media_id,
               is_active, sort_order, pinned,
               archived_at, archived_by,
               usage_count, last_used_at, used_by,
               created_by, created_at, updated_by, updated_at,
               FALSE AS is_favorite`,
    [s.category_id, s.title, s.body, s.caption, s.content_type,
     s.media_id, s.sort_order, s.is_active, createdBy]
  );
  if (s.media_id) await incRefCount(s.media_id);
  return qrFromRow(rows[0] as Record<string, unknown>);
}

// 11. Increment usage (called when quick reply is sent)
export async function incrementQuickReplyUsage(id: number, usedBy: string): Promise<void> {
  await pool.query(
    `UPDATE quick_replies SET usage_count = usage_count + 1, last_used_at = NOW(), used_by = $2 WHERE id = $1`,
    [id, usedBy]
  );
}

// 12. Pin / Unpin
export async function setQuickReplyPinned(id: number, pinned: boolean): Promise<void> {
  await pool.query(
    `UPDATE quick_replies SET pinned = $2 WHERE id = $1`,
    [id, pinned]
  );
}

// 13. Favorite / Unfavorite
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

// 14. Recently used (last N, for manager page Recent section)
export async function getRecentlyUsedReplies(limit = 20): Promise<QuickReply[]> {
  const { rows } = await pool.query(
    `SELECT ${QR_COLS},
            FALSE AS is_favorite,
            ${ML_COLS}
     FROM quick_replies qr
     LEFT JOIN quick_reply_categories qrc ON qrc.id = qr.category_id
     LEFT JOIN media_library ml           ON ml.id = qr.media_id AND ml.deleted_at IS NULL
     WHERE qr.last_used_at IS NOT NULL AND qr.archived_at IS NULL
     ORDER BY qr.last_used_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map(r => qrFromRow(r as Record<string, unknown>));
}

// 15. Pinned (for manager page Pinned section)
export async function getPinnedReplies(): Promise<QuickReply[]> {
  const { rows } = await pool.query(
    `SELECT ${QR_COLS},
            FALSE AS is_favorite,
            ${ML_COLS}
     FROM quick_replies qr
     LEFT JOIN quick_reply_categories qrc ON qrc.id = qr.category_id
     LEFT JOIN media_library ml           ON ml.id = qr.media_id AND ml.deleted_at IS NULL
     WHERE qr.pinned = TRUE AND qr.archived_at IS NULL
     ORDER BY qr.pinned DESC, qrc.sort_order NULLS LAST, qr.sort_order, qr.id`
  );
  return rows.map(r => qrFromRow(r as Record<string, unknown>));
}

// 16. Bulk category change
export async function bulkSetCategory(
  ids: number[], categoryId: number | null, updatedBy: string
): Promise<void> {
  await pool.query(
    `UPDATE quick_replies SET category_id = $1, updated_by = $2 WHERE id = ANY($3)`,
    [categoryId, updatedBy, ids]
  );
}

// 17. Bulk toggle active
export async function bulkSetActive(
  ids: number[], isActive: boolean, updatedBy: string
): Promise<void> {
  await pool.query(
    `UPDATE quick_replies SET is_active = $1, updated_by = $2 WHERE id = ANY($3)`,
    [isActive, updatedBy, ids]
  );
}

// 18. Bulk delete
export async function bulkDeleteReplies(ids: number[]): Promise<void> {
  const { rows } = await pool.query<{ media_id: number | null }>(
    `SELECT media_id FROM quick_replies WHERE id = ANY($1)`,
    [ids]
  );
  await pool.query(`DELETE FROM quick_replies WHERE id = ANY($1)`, [ids]);
  const mediaIds = rows.map(r => r.media_id).filter((m): m is number => m != null);
  await Promise.all(mediaIds.map(mId => decRefCount(mId)));
}

// 19. Bulk archive
export async function bulkArchiveReplies(ids: number[], archivedBy: string): Promise<void> {
  await pool.query(
    `UPDATE quick_replies SET archived_at = NOW(), archived_by = $1 WHERE id = ANY($2)`,
    [archivedBy, ids]
  );
}

// ── Session Notes ─────────────────────────────────────────────────────────────

export async function getSessionNotes(sessionId: number): Promise<SessionNote[]> {
  const { rows } = await pool.query(
    `SELECT id, session_id, author, body, created_at
     FROM session_notes
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );
  return rows;
}

export async function createSessionNote(data: {
  session_id: number;
  author: string;
  body: string;
}): Promise<SessionNote> {
  const { rows } = await pool.query(
    `INSERT INTO session_notes (session_id, author, body)
     VALUES ($1, $2, $3)
     RETURNING id, session_id, author, body, created_at`,
    [data.session_id, data.author, data.body]
  );
  return rows[0];
}

export async function deleteSessionNote(noteId: number): Promise<void> {
  await pool.query(`DELETE FROM session_notes WHERE id=$1`, [noteId]);
}

// ── Customer Tags ─────────────────────────────────────────────────────────────

export async function getAllTags(): Promise<CustomerTag[]> {
  const { rows } = await pool.query(
    `SELECT id, name, color, created_at FROM customer_tags ORDER BY name`
  );
  return rows;
}

export async function createTag(data: { name: string; color: string }): Promise<CustomerTag> {
  const { rows } = await pool.query(
    `INSERT INTO customer_tags (name, color) VALUES ($1, $2)
     RETURNING id, name, color, created_at`,
    [data.name, data.color]
  );
  return rows[0];
}

export async function updateTag(
  id: number,
  data: { name?: string; color?: string }
): Promise<CustomerTag | null> {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  let i = 1;
  if (data.name  !== undefined) { sets.push(`name=$${i++}`);  params.push(data.name); }
  if (data.color !== undefined) { sets.push(`color=$${i++}`); params.push(data.color); }
  if (!sets.length) return null;
  params.push(id);
  const { rows } = await pool.query(
    `UPDATE customer_tags SET ${sets.join(', ')} WHERE id=$${i}
     RETURNING id, name, color, created_at`,
    params
  );
  return rows[0] ?? null;
}

export async function deleteTag(id: number): Promise<void> {
  await pool.query(`DELETE FROM customer_tags WHERE id=$1`, [id]);
}

export async function getTagsForUser(userId: number): Promise<CustomerTag[]> {
  const { rows } = await pool.query(
    `SELECT ct.id, ct.name, ct.color, ct.created_at
     FROM user_tag_assignments uta
     JOIN customer_tags ct ON ct.id = uta.tag_id
     WHERE uta.user_id = $1
     ORDER BY ct.name`,
    [userId]
  );
  return rows;
}

export async function assignTagToUser(data: {
  user_id: number;
  tag_id: number;
  assigned_by: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO user_tag_assignments (user_id, tag_id, assigned_by)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [data.user_id, data.tag_id, data.assigned_by]
  );
}

export async function removeTagFromUser(userId: number, tagId: number): Promise<void> {
  await pool.query(
    `DELETE FROM user_tag_assignments WHERE user_id=$1 AND tag_id=$2`,
    [userId, tagId]
  );
}

export async function getSessionUserId(sessionId: number): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT user_id FROM support_sessions WHERE id=$1`,
    [sessionId]
  );
  return rows[0]?.user_id ?? null;
}
