import pool from '@/lib/db';
import type { WebsiteAnnouncement } from '@/lib/types';

export interface WebsiteAnnouncementInput {
  title: string;
  message: string;
  type?: 'info' | 'promotion' | 'warning';
  link_url?: string | null;
  display_order?: number;
  is_active?: boolean;
  start_at?: string | null;
  end_at?: string | null;
}

export async function getAllWebsiteAnnouncements(): Promise<WebsiteAnnouncement[]> {
  const { rows } = await pool.query<WebsiteAnnouncement>(
    'SELECT * FROM website_announcements ORDER BY display_order ASC, id ASC'
  );
  return rows;
}

export async function getActiveWebsiteAnnouncements(): Promise<WebsiteAnnouncement[]> {
  const { rows } = await pool.query<WebsiteAnnouncement>(
    `SELECT * FROM website_announcements
     WHERE is_active = TRUE
       AND (start_at IS NULL OR start_at <= NOW())
       AND (end_at   IS NULL OR end_at   >  NOW())
     ORDER BY display_order ASC, id ASC`
  );
  return rows;
}

export async function getWebsiteAnnouncementById(id: number): Promise<WebsiteAnnouncement | null> {
  const { rows } = await pool.query<WebsiteAnnouncement>(
    'SELECT * FROM website_announcements WHERE id = $1', [id]
  );
  return rows[0] ?? null;
}

export async function createWebsiteAnnouncement(
  data: WebsiteAnnouncementInput
): Promise<WebsiteAnnouncement> {
  const { rows } = await pool.query<WebsiteAnnouncement>(
    `INSERT INTO website_announcements
       (title, message, type, link_url, display_order, is_active, start_at, end_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      data.title,
      data.message,
      data.type ?? 'info',
      data.link_url ?? null,
      data.display_order ?? 0,
      data.is_active ?? true,
      data.start_at ?? null,
      data.end_at ?? null,
    ]
  );
  return rows[0];
}

export async function updateWebsiteAnnouncement(
  id: number,
  data: Partial<WebsiteAnnouncementInput>
): Promise<WebsiteAnnouncement | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const allowed: (keyof WebsiteAnnouncementInput)[] = [
    'title', 'message', 'type', 'link_url', 'display_order', 'is_active', 'start_at', 'end_at',
  ];
  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = $${i++}`);
      values.push(data[key] ?? null);
    }
  }
  if (fields.length === 0) return getWebsiteAnnouncementById(id);

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query<WebsiteAnnouncement>(
    `UPDATE website_announcements SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteWebsiteAnnouncement(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'DELETE FROM website_announcements WHERE id = $1', [id]
  );
  return (rowCount ?? 0) > 0;
}
