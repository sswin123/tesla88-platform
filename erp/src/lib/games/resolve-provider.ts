import pool from '@/lib/db';

/**
 * Resolve a provider by either its numeric id (e.g. "42") or string code (e.g. "918KISS").
 * Used by all API routes under /api/games/settings/[code] so that URLs like
 * /api/games/settings/42 and /api/games/settings/918KISS both work correctly.
 */
export async function resolveProvider(
  codeOrId: string,
): Promise<{ id: number; code: string } | null> {
  const isId = /^\d+$/.test(codeOrId);
  const { rows } = await pool.query<{ id: number; code: string }>(
    isId
      ? 'SELECT id, code FROM gp_providers WHERE id = $1'
      : 'SELECT id, code FROM gp_providers WHERE code = $1 LIMIT 1',
    [isId ? parseInt(codeOrId, 10) : codeOrId.toUpperCase()],
  );
  return rows[0] ?? null;
}
