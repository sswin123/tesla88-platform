import pool from '@/lib/db';
import type { WebsiteBanner } from '@/lib/types';

export async function getAllBanners(): Promise<WebsiteBanner[]> {
  const { rows } = await pool.query<WebsiteBanner>(
    'SELECT * FROM website_banners ORDER BY display_order ASC, id ASC'
  );
  return rows;
}

export async function getActiveBanners(): Promise<WebsiteBanner[]> {
  const { rows } = await pool.query<WebsiteBanner>(
    `SELECT * FROM website_banners
     WHERE is_active = TRUE
       AND (start_at IS NULL OR start_at <= NOW())
       AND (end_at   IS NULL OR end_at   >  NOW())
     ORDER BY display_order ASC, id ASC`
  );
  return rows;
}

export async function getBannerById(id: number): Promise<WebsiteBanner | null> {
  const { rows } = await pool.query<WebsiteBanner>(
    'SELECT * FROM website_banners WHERE id = $1', [id]
  );
  return rows[0] ?? null;
}

export interface BannerInput {
  title: string;
  description?: string | null;
  image_media_id?: number | null;
  mobile_image_media_id?: number | null;
  link_url?: string | null;
  button_text?: string | null;
  display_order?: number;
  is_active?: boolean;
  start_at?: string | null;
  end_at?: string | null;
}

export async function createBanner(data: BannerInput): Promise<WebsiteBanner> {
  const { rows } = await pool.query<WebsiteBanner>(
    `INSERT INTO website_banners
       (title, description, image_media_id, mobile_image_media_id,
        link_url, button_text, display_order, is_active, start_at, end_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      data.title,
      data.description ?? null,
      data.image_media_id ?? null,
      data.mobile_image_media_id ?? null,
      data.link_url ?? null,
      data.button_text ?? null,
      data.display_order ?? 0,
      data.is_active ?? true,
      data.start_at ?? null,
      data.end_at ?? null,
    ]
  );
  return rows[0];
}

export async function updateBanner(
  id: number,
  data: Partial<BannerInput>
): Promise<WebsiteBanner | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const allowed: (keyof BannerInput)[] = [
    'title', 'description', 'image_media_id', 'mobile_image_media_id',
    'link_url', 'button_text', 'display_order', 'is_active', 'start_at', 'end_at',
  ];
  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = $${i++}`);
      values.push(data[key] ?? null);
    }
  }
  if (fields.length === 0) return getBannerById(id);

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query<WebsiteBanner>(
    `UPDATE website_banners SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteBanner(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'DELETE FROM website_banners WHERE id = $1', [id]
  );
  return (rowCount ?? 0) > 0;
}
