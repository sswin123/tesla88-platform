import pool from '@/lib/db';
import type {
  Broadcast, CreateBroadcastInput, BroadcastAudienceType, BroadcastStatus,
} from '@/lib/types';

// ── Column projections ────────────────────────────────────────────────────────

const B_COLS = `
  b.id, b.title, b.content_type, b.body, b.caption, b.media_id,
  b.channels, b.audience_type, b.audience_tag_id, b.audience_user_ids,
  b.status, b.scheduled_at, b.sent_at,
  b.recipient_count, b.success_count, b.failed_count,
  b.created_by, b.created_at, b.updated_at,
  ct.name  AS audience_tag_name,
  ml.id    AS ml_id,
  ml.display_name AS ml_display_name,
  ml.mime_type    AS ml_mime_type,
  ml.file_size    AS ml_file_size,
  ml.file_path    AS ml_file_path,
  ml.created_at   AS ml_created_at
`;

function broadcastFromRow(row: Record<string, unknown>): Broadcast {
  const b: Broadcast = {
    id:               row.id as number,
    title:            row.title as string,
    content_type:     row.content_type as Broadcast['content_type'],
    body:             row.body as string,
    caption:          (row.caption as string | null) ?? null,
    media_id:         (row.media_id as number | null) ?? null,
    channels:         (row.channels as string[]) as Broadcast['channels'],
    audience_type:    row.audience_type as Broadcast['audience_type'],
    audience_tag_id:  (row.audience_tag_id as number | null) ?? null,
    audience_tag_name:(row.audience_tag_name as string | null) ?? null,
    audience_user_ids:(row.audience_user_ids as number[] | null) ?? null,
    status:           row.status as BroadcastStatus,
    scheduled_at:     (row.scheduled_at as string | null) ?? null,
    sent_at:          (row.sent_at as string | null) ?? null,
    recipient_count:  (row.recipient_count as number) ?? 0,
    success_count:    (row.success_count as number) ?? 0,
    failed_count:     (row.failed_count as number) ?? 0,
    created_by:       row.created_by as string,
    created_at:       row.created_at as string,
    updated_at:       row.updated_at as string,
  };
  if (row.ml_id !== null && row.ml_id !== undefined) {
    b.media = {
      id:               row.ml_id as number,
      displayName:      row.ml_display_name as string,
      mimeType:         row.ml_mime_type as string,
      fileSize:         row.ml_file_size as number,
      storageKey:       row.ml_file_path as string,
      createdAt:        row.ml_created_at as string,
      // required fields with safe defaults for join projection
      tenantId:         null,
      fileHash:         '',
      storageProvider:  '',
      mediaType:        'UNKNOWN' as import('@/lib/media/types').MediaType,
      extension:        '',
      originalFilename: '',
      width:            null,
      height:           null,
      duration:         null,
      thumbnailKey:     null,
      thumbnailStatus:  'NONE' as import('@/lib/media/types').ThumbnailStatus,
      metadata:         {},
      usageCount:       0,
      referenceCount:   0,
      lastUsedAt:       null,
      lastUsedModule:   null,
      downloadCount:    0,
      lastDownloadedAt: null,
      createdBy:        null,
      updatedAt:        row.ml_created_at as string,
      isActive:         true,
      deletedAt:        null,
      deletedBy:        null,
    };
  }
  return b;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getBroadcasts(opts: {
  status?: string;
  limit: number;
  offset: number;
}): Promise<{ data: Broadcast[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (opts.status) {
    conditions.push(`b.status = $${i++}`);
    params.push(opts.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows, countRow] = await Promise.all([
    pool.query(
      `SELECT ${B_COLS}
       FROM broadcasts b
       LEFT JOIN customer_tags ct ON ct.id = b.audience_tag_id
       LEFT JOIN media_library ml ON ml.id = b.media_id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, opts.limit, opts.offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM broadcasts b ${where}`,
      params
    ),
  ]);
  return { data: rows.rows.map(broadcastFromRow), total: countRow.rows[0].count };
}

export async function getBroadcastById(id: number): Promise<Broadcast | null> {
  const r = await pool.query(
    `SELECT ${B_COLS}
     FROM broadcasts b
     LEFT JOIN customer_tags ct ON ct.id = b.audience_tag_id
     LEFT JOIN media_library ml ON ml.id = b.media_id
     WHERE b.id = $1`,
    [id]
  );
  return r.rows.length ? broadcastFromRow(r.rows[0]) : null;
}

export async function createBroadcast(
  data: CreateBroadcastInput,
  createdBy: string,
): Promise<Broadcast> {
  const r = await pool.query(
    `INSERT INTO broadcasts
       (title, content_type, body, caption, media_id, channels,
        audience_type, audience_tag_id, audience_user_ids, status, scheduled_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      data.title,
      data.content_type,
      data.body,
      data.caption ?? null,
      data.media_id ?? null,
      data.channels,
      data.audience_type,
      data.audience_tag_id ?? null,
      data.audience_user_ids ?? null,
      data.status ?? 'DRAFT',
      data.scheduled_at ?? null,
      createdBy,
    ]
  );
  return broadcastFromRow({ ...r.rows[0], audience_tag_name: null, ml_id: null });
}

const UPDATABLE = new Set([
  'title','content_type','body','caption','media_id','channels',
  'audience_type','audience_tag_id','audience_user_ids','status','scheduled_at',
]);

export async function updateBroadcast(
  id: number,
  data: Partial<CreateBroadcastInput>,
): Promise<Broadcast | null> {
  const fields = Object.keys(data).filter(k => UPDATABLE.has(k));
  if (fields.length === 0) return null;
  const sets = fields.map((f, idx) => `${f} = $${idx + 2}`).join(', ');
  const values = fields.map(f => (data as Record<string, unknown>)[f]);
  const r = await pool.query(
    `UPDATE broadcasts SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return r.rows.length ? broadcastFromRow({ ...r.rows[0], audience_tag_name: null, ml_id: null }) : null;
}

export async function deleteBroadcast(id: number): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM broadcasts WHERE id = $1 AND status = 'DRAFT'`,
    [id]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function updateBroadcastCounts(
  id: number,
  opts: {
    status: BroadcastStatus;
    recipient_count?: number;
    success_count?: number;
    failed_count?: number;
    sent_at?: Date;
  },
): Promise<void> {
  const sets: string[] = ['status = $2'];
  const params: unknown[] = [id, opts.status];
  let i = 3;
  if (opts.recipient_count !== undefined) { sets.push(`recipient_count = $${i++}`); params.push(opts.recipient_count); }
  if (opts.success_count   !== undefined) { sets.push(`success_count = $${i++}`);   params.push(opts.success_count);   }
  if (opts.failed_count    !== undefined) { sets.push(`failed_count = $${i++}`);    params.push(opts.failed_count);    }
  if (opts.sent_at         !== undefined) { sets.push(`sent_at = $${i++}`);         params.push(opts.sent_at);         }
  await pool.query(`UPDATE broadcasts SET ${sets.join(', ')} WHERE id = $1`, params);
}

// ── Audience resolution ───────────────────────────────────────────────────────

export async function resolveAudienceTelegramIds(
  audienceType: BroadcastAudienceType,
  opts?: { tagId?: number | null; userIds?: number[] | null },
): Promise<string[]> {
  let sql: string;
  let params: unknown[] = [];

  switch (audienceType) {
    case 'TAG':
      sql = `SELECT DISTINCT u.telegram_id FROM users u
             JOIN user_tag_assignments uta ON uta.user_id = u.id
             WHERE uta.tag_id = $1 AND u.telegram_id IS NOT NULL AND u.telegram_id != ''`;
      params = [opts?.tagId];
      break;
    case 'VIP':
      sql = `SELECT DISTINCT u.telegram_id FROM users u
             JOIN user_tag_assignments uta ON uta.user_id = u.id
             JOIN customer_tags ct ON ct.id = uta.tag_id AND ct.name = 'VIP'
             WHERE u.telegram_id IS NOT NULL AND u.telegram_id != ''`;
      break;
    case 'ACTIVE':
      sql = `SELECT telegram_id FROM users
             WHERE status = 'ACTIVE'
               AND last_seen_at >= NOW() - INTERVAL '30 days'
               AND telegram_id IS NOT NULL AND telegram_id != ''`;
      break;
    case 'INACTIVE':
      sql = `SELECT telegram_id FROM users
             WHERE status = 'ACTIVE'
               AND (last_seen_at < NOW() - INTERVAL '30 days' OR last_seen_at IS NULL)
               AND telegram_id IS NOT NULL AND telegram_id != ''`;
      break;
    case 'NEVER_DEPOSIT':
      sql = `SELECT telegram_id FROM users
             WHERE CAST(total_deposit AS NUMERIC) = 0
               AND telegram_id IS NOT NULL AND telegram_id != ''`;
      break;
    case 'DEPOSITED':
      sql = `SELECT telegram_id FROM users
             WHERE CAST(total_deposit AS NUMERIC) > 0
               AND telegram_id IS NOT NULL AND telegram_id != ''`;
      break;
    case 'SELECTED':
      sql = `SELECT telegram_id FROM users
             WHERE id = ANY($1::int[])
               AND telegram_id IS NOT NULL AND telegram_id != ''`;
      params = [opts?.userIds ?? []];
      break;
    default: // ALL
      sql = `SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND telegram_id != ''`;
  }

  const r = await pool.query(sql, params);
  return r.rows.map((row: { telegram_id: string }) => row.telegram_id);
}

export async function getAudienceCount(
  audienceType: BroadcastAudienceType,
  opts?: { tagId?: number | null; userIds?: number[] | null },
): Promise<number> {
  const ids = await resolveAudienceTelegramIds(audienceType, opts);
  return ids.length;
}

export async function getActiveSessionUserIds(
  userIds: number[],
): Promise<{ user_id: number; session_id: number }[]> {
  if (userIds.length === 0) return [];
  const r = await pool.query(
    `SELECT DISTINCT ON (ss.user_id) ss.user_id, ss.id AS session_id
     FROM support_sessions ss
     WHERE ss.user_id = ANY($1::int[])
       AND ss.status IN ('OPEN','ACTIVE')
     ORDER BY ss.user_id, ss.updated_at DESC`,
    [userIds]
  );
  return r.rows;
}
