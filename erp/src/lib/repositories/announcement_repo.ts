import pool from '@/lib/db';
import type { Announcement } from '@/lib/types';

export async function getAnnouncements(opts: {
  status?: string;
  limit: number;
  offset: number;
}): Promise<{ data: Announcement[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (opts.status) {
    conditions.push(`a.status = $${i++}`);
    params.push(opts.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows, countRow] = await Promise.all([
    pool.query(
      `SELECT a.*, ct.name AS target_tag_name
       FROM announcements a
       LEFT JOIN customer_tags ct ON ct.id = a.target_tag_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, opts.limit, opts.offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM announcements a ${where}`,
      params
    ),
  ]);
  return { data: rows.rows, total: countRow.rows[0].count };
}

export async function createAnnouncement(data: {
  title: string;
  content: string;
  type: string;
  target: string;
  target_tag_id?: number | null;
  status: string;
  start_at?: string | null;
  end_at?: string | null;
  created_by: string;
}): Promise<Announcement> {
  const r = await pool.query(
    `INSERT INTO announcements (title, content, type, target, target_tag_id, status, start_at, end_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      data.title,
      data.content,
      data.type,
      data.target,
      data.target_tag_id ?? null,
      data.status,
      data.start_at ?? null,
      data.end_at ?? null,
      data.created_by,
    ]
  );
  return { ...r.rows[0], target_tag_name: null };
}

export async function updateAnnouncement(
  id: number,
  data: Partial<Omit<Announcement, 'id' | 'created_at' | 'created_by' | 'target_tag_name'>>
): Promise<Announcement | null> {
  const fields = Object.keys(data).filter(k => k !== 'id');
  if (fields.length === 0) return null;
  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => (data as Record<string, unknown>)[f]);
  const r = await pool.query(
    `UPDATE announcements SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return r.rows[0] ?? null;
}

export async function deleteAnnouncement(id: number): Promise<void> {
  await pool.query(`DELETE FROM announcements WHERE id = $1`, [id]);
}

export async function getUsersForBroadcast(
  target: string,
  tagId?: number | null
): Promise<{ telegram_id: string }[]> {
  if (target === 'VIP') {
    const r = await pool.query(
      `SELECT DISTINCT u.telegram_id FROM users u
       JOIN user_tag_assignments uta ON uta.user_id = u.id
       JOIN customer_tags ct ON ct.id = uta.tag_id AND ct.name = 'VIP'
       WHERE u.telegram_id IS NOT NULL AND u.telegram_id != ''`
    );
    return r.rows;
  }
  if (target === 'TAG' && tagId) {
    const r = await pool.query(
      `SELECT DISTINCT u.telegram_id FROM users u
       JOIN user_tag_assignments uta ON uta.user_id = u.id
       WHERE uta.tag_id = $1 AND u.telegram_id IS NOT NULL AND u.telegram_id != ''`,
      [tagId]
    );
    return r.rows;
  }
  // ALL
  const r = await pool.query(
    `SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND telegram_id != ''`
  );
  return r.rows;
}

export async function incrementSentCount(id: number, count: number): Promise<void> {
  await pool.query(
    `UPDATE announcements SET sent_count = sent_count + $2 WHERE id = $1`,
    [id, count]
  );
}

export async function getAnnouncementById(id: number): Promise<Announcement | null> {
  const r = await pool.query(
    `SELECT a.*, ct.name AS target_tag_name
     FROM announcements a
     LEFT JOIN customer_tags ct ON ct.id = a.target_tag_id
     WHERE a.id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}
