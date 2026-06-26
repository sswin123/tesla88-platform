import pool from '@/lib/db';
import type { Provider } from '@/lib/types';

export async function getAllProviders(): Promise<Provider[]> {
  const { rows } = await pool.query<Provider>(
    'SELECT * FROM providers ORDER BY sort_order, name'
  );
  return rows;
}

export async function getActiveProviders(): Promise<Provider[]> {
  const { rows } = await pool.query<Provider>(
    "SELECT * FROM providers WHERE status = 'ACTIVE' ORDER BY sort_order"
  );
  return rows;
}

export async function getProviderById(id: number): Promise<Provider | null> {
  const { rows } = await pool.query<Provider>(
    'SELECT * FROM providers WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
}

export async function createProvider(data: {
  name: string;
  display_name: string;
  description?: string | null;
  logo_url?: string | null;
  sort_order?: number;
}): Promise<Provider> {
  const { rows } = await pool.query<Provider>(
    `INSERT INTO providers (name, display_name, description, logo_url, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.name,
      data.display_name,
      data.description ?? null,
      data.logo_url ?? null,
      data.sort_order ?? 0,
    ]
  );
  return rows[0];
}

const ALLOWED_UPDATE_FIELDS = new Set([
  'display_name', 'description', 'logo_url', 'status', 'sort_order',
]);

export async function updateProvider(
  id: number,
  data: {
    display_name?: string;
    description?: string | null;
    logo_url?: string | null;
    status?: string;
    sort_order?: number;
  }
): Promise<Provider | null> {
  const fields = (Object.keys(data) as (keyof typeof data)[]).filter(
    (k) => ALLOWED_UPDATE_FIELDS.has(k as string)
  );
  if (fields.length === 0) return getProviderById(id);

  const setClauses = fields.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = fields.map((k) => data[k]);

  const { rows } = await pool.query<Provider>(
    `UPDATE providers SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return rows[0] ?? null;
}

export async function deleteProvider(id: number): Promise<void> {
  await pool.query(
    "UPDATE providers SET status = 'DISABLED', updated_at = NOW() WHERE id = $1",
    [id]
  );
}
