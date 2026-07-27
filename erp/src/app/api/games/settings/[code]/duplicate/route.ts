import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

/**
 * POST /api/games/settings/[code]/duplicate
 * Clones a provider record, its gp_config rows, and its gp_credentials rows
 * under a new code. The new provider starts with status = DISABLED.
 *
 * Body: { new_code: string, new_name?: string, new_display_name?: string }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const body = await req.json().catch(() => ({})) as {
    new_code?: unknown;
    new_name?: unknown;
    new_display_name?: unknown;
  };

  const newCode = typeof body.new_code === 'string' ? body.new_code.trim().toUpperCase() : '';
  if (!newCode || !/^[A-Z0-9_]{2,30}$/.test(newCode)) {
    return NextResponse.json(
      { error: 'new_code must be 2-30 uppercase letters, digits, or underscores' },
      { status: 400 },
    );
  }

  // Fetch source provider
  const { rows: srcRows } = await pool.query<{
    id: number;
    name: string;
    display_name: string;
    version: string;
    priority: number;
    environment: string;
    wallet_type: string;
    capabilities: string;
    metadata: string;
  }>(
    `SELECT id, name, display_name, version, priority, environment,
            wallet_type, capabilities::text, metadata::text
     FROM gp_providers WHERE code = $1`,
    [code.toUpperCase()],
  );
  if (srcRows.length === 0) {
    return NextResponse.json({ error: 'Source provider not found' }, { status: 404 });
  }
  const src = srcRows[0];

  // Check new_code uniqueness
  const { rows: existing } = await pool.query(
    `SELECT id FROM gp_providers WHERE code = $1`,
    [newCode],
  );
  if (existing.length > 0) {
    return NextResponse.json({ error: `Provider code "${newCode}" already exists` }, { status: 409 });
  }

  const newName =
    typeof body.new_name === 'string' && body.new_name.trim()
      ? body.new_name.trim()
      : `${src.name} (copy)`;
  const newDisplayName =
    typeof body.new_display_name === 'string' && body.new_display_name.trim()
      ? body.new_display_name.trim()
      : newName;

  // Create new provider (status = DISABLED so it is safe to configure before enabling)
  const { rows: newRows } = await pool.query<{ id: number; code: string }>(
    `INSERT INTO gp_providers
       (code, name, display_name, version, priority, status, environment,
        wallet_type, capabilities, metadata)
     VALUES ($1,$2,$3,$4,$5,'DISABLED',$6,$7,$8,$9)
     RETURNING id, code`,
    [
      newCode, newName, newDisplayName, src.version,
      src.priority, src.environment, src.wallet_type,
      src.capabilities, src.metadata,
    ],
  );
  const newId = newRows[0].id;

  // Copy gp_config rows
  const { rows: cfgRows } = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM gp_config WHERE provider_id = $1`,
    [src.id],
  );
  for (const row of cfgRows) {
    await pool.query(
      `INSERT INTO gp_config (provider_id, key, value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (provider_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [newId, row.key, row.value],
    );
  }

  // Copy gp_credentials rows (key, value, is_encrypted; updated_by = NULL)
  const { rows: credRows } = await pool.query<{
    key: string;
    value: string;
    is_encrypted: boolean;
  }>(
    `SELECT key, value, is_encrypted FROM gp_credentials WHERE provider_id = $1`,
    [src.id],
  );
  for (const row of credRows) {
    await pool.query(
      `INSERT INTO gp_credentials (provider_id, key, value, is_encrypted, updated_by_name)
       VALUES ($1, $2, $3, $4, 'system (duplicated)')
       ON CONFLICT (provider_id, key) DO UPDATE
         SET value = EXCLUDED.value,
             is_encrypted = EXCLUDED.is_encrypted,
             updated_by = NULL,
             updated_by_name = 'system (duplicated)',
             updated_at = NOW()`,
      [newId, row.key, row.value, row.is_encrypted],
    );
  }

  return NextResponse.json({ ok: true, new_code: newRows[0].code }, { status: 201 });
}
