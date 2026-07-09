import pool from '@/lib/db';
import type { WebsiteGameProvider } from '@/lib/types';

export interface GameProviderInput {
  provider_code: string;
  provider_name: string;
  category?: 'slot' | 'live' | 'sport' | 'fishing';
  logo_media_id?: number | null;
  banner_media_id?: number | null;
  is_hot?: boolean;
  is_new?: boolean;
  is_active?: boolean;
  display_order?: number;
}

export async function getAllGameProviders(): Promise<WebsiteGameProvider[]> {
  const { rows } = await pool.query<WebsiteGameProvider>(
    'SELECT * FROM website_game_providers ORDER BY display_order ASC, id ASC'
  );
  return rows;
}

export async function getActiveGameProviders(): Promise<WebsiteGameProvider[]> {
  const { rows } = await pool.query<WebsiteGameProvider>(
    `SELECT * FROM website_game_providers
     WHERE is_active = TRUE
     ORDER BY display_order ASC, id ASC`
  );
  return rows;
}

export async function getGameProviderById(id: number): Promise<WebsiteGameProvider | null> {
  const { rows } = await pool.query<WebsiteGameProvider>(
    'SELECT * FROM website_game_providers WHERE id = $1', [id]
  );
  return rows[0] ?? null;
}

export async function createGameProvider(data: GameProviderInput): Promise<WebsiteGameProvider> {
  const { rows } = await pool.query<WebsiteGameProvider>(
    `INSERT INTO website_game_providers
       (provider_code, provider_name, category, logo_media_id, banner_media_id,
        is_hot, is_new, is_active, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      data.provider_code,
      data.provider_name,
      data.category ?? 'slot',
      data.logo_media_id ?? null,
      data.banner_media_id ?? null,
      data.is_hot ?? false,
      data.is_new ?? false,
      data.is_active ?? true,
      data.display_order ?? 0,
    ]
  );
  return rows[0];
}

export async function updateGameProvider(
  id: number,
  data: Partial<GameProviderInput>
): Promise<WebsiteGameProvider | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const allowed: (keyof GameProviderInput)[] = [
    'provider_code', 'provider_name', 'category',
    'logo_media_id', 'banner_media_id',
    'is_hot', 'is_new', 'is_active', 'display_order',
  ];
  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = $${i++}`);
      values.push(data[key] ?? null);
    }
  }
  if (fields.length === 0) return getGameProviderById(id);

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query<WebsiteGameProvider>(
    `UPDATE website_game_providers SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteGameProvider(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'DELETE FROM website_game_providers WHERE id = $1', [id]
  );
  return (rowCount ?? 0) > 0;
}
