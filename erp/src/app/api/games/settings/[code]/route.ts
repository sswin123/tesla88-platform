import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function maskValue(val: string): string {
  if (!val) return '—';
  if (val.length <= 8) return '*'.repeat(val.length);
  return val.slice(0, 4) + '*'.repeat(val.length - 8) + val.slice(-4);
}

async function writeAuditLog(opts: {
  providerId: number;
  providerCode: string;
  adminId: number;
  adminUsername: string;
  action: string;
  fieldKey?: string;
  oldHint?: string;
  newHint?: string;
  ip: string;
  notes?: string;
}) {
  await pool.query(
    `INSERT INTO gp_config_audit_log
       (provider_id, provider_code, admin_id, admin_username, action,
        field_key, old_value_hint, new_value_hint, ip_address, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      opts.providerId, opts.providerCode, opts.adminId, opts.adminUsername,
      opts.action, opts.fieldKey ?? null, opts.oldHint ?? null,
      opts.newHint ?? null, opts.ip, opts.notes ?? null,
    ],
  );
}

async function takeHistorySnapshot(opts: {
  providerId: number;
  providerCode: string;
  providerStatus: string;
  adminId: number;
  adminUsername: string;
  summary: string;
}) {
  // Get current config
  const { rows: cfgRows } = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM gp_config WHERE provider_id = $1`, [opts.providerId],
  );
  const configSnapshot: Record<string, string> = {};
  for (const r of cfgRows) configSnapshot[r.key] = r.value;

  // Get credential keys only (no values)
  const { rows: credRows } = await pool.query<{ key: string }>(
    `SELECT key FROM gp_credentials WHERE provider_id = $1`, [opts.providerId],
  );
  const credKeys = credRows.map(r => r.key);

  // Get next version number
  const { rows: vRows } = await pool.query<{ max: number | null }>(
    `SELECT MAX(version_number) AS max FROM gp_config_history WHERE provider_id = $1`,
    [opts.providerId],
  );
  const nextVersion = (vRows[0]?.max ?? 0) + 1;

  await pool.query(
    `INSERT INTO gp_config_history
       (provider_id, version_number, config_snapshot, cred_keys, provider_status,
        admin_id, admin_username, change_summary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (provider_id, version_number) DO NOTHING`,
    [
      opts.providerId, nextVersion,
      JSON.stringify(configSnapshot), JSON.stringify(credKeys),
      opts.providerStatus, opts.adminId, opts.adminUsername, opts.summary,
    ],
  );
}

/**
 * GET /api/games/settings/[code]
 * Returns provider details, config keys, and masked credentials.
 * Requires game.manage.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;

  const { rows: provRows } = await pool.query(
    `SELECT id, code, name, display_name, version, status, environment,
            wallet_type, capabilities, health_status, health_checked_at,
            last_success_at, last_failed_at, last_reload_at, adapter_loaded,
            metadata, created_at, updated_at,
            website_visible, website_display_name, website_logo_url, website_banner_url,
            website_category, website_sort_order, website_is_hot, website_is_new,
            website_maintenance, website_launch_mode, website_display_mode, website_platforms
     FROM gp_providers WHERE code = $1 LIMIT 1`,
    [code.toUpperCase()],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

  const provider = provRows[0];

  const { rows: cfgRows } = await pool.query(
    `SELECT key, value, updated_at, updated_by_name
     FROM gp_config WHERE provider_id = $1 ORDER BY key`,
    [provider.id],
  );

  const { rows: credRows } = await pool.query(
    `SELECT key, is_encrypted, updated_at, updated_by_name,
            CASE
              WHEN LENGTH(value) <= 8 THEN REPEAT('*', LENGTH(value))
              ELSE SUBSTRING(value,1,4) || REPEAT('*', LENGTH(value)-8) || SUBSTRING(value, LENGTH(value)-3)
            END AS masked_value
     FROM gp_credentials WHERE provider_id = $1 ORDER BY key`,
    [provider.id],
  );

  // Latest audit entries for this provider (last 5)
  const { rows: auditRows } = await pool.query(
    `SELECT action, field_key, old_value_hint, new_value_hint, admin_username, ip_address, created_at
     FROM gp_config_audit_log WHERE provider_id = $1
     ORDER BY created_at DESC LIMIT 5`,
    [provider.id],
  );

  // Brand-provider summary (for non-legacy providers managed via brand_provider_credentials)
  const { rows: bpRows } = await pool.query<{
    bp_id: number; brand_code: string; bp_status: string; cred_count: string; cfg_count: string;
  }>(
    `SELECT bp.id AS bp_id, b.code AS brand_code, bp.status AS bp_status,
            (SELECT COUNT(*) FROM brand_provider_credentials c WHERE c.brand_provider_id = bp.id)::text AS cred_count,
            (SELECT COUNT(*) FROM brand_provider_config     cf WHERE cf.brand_provider_id = bp.id)::text AS cfg_count
     FROM brand_providers bp
     JOIN brands b ON b.id = bp.brand_id
     WHERE bp.provider_id = $1
     ORDER BY bp.status = 'ACTIVE' DESC, bp.id ASC
     LIMIT 1`,
    [provider.id],
  );

  // Game count and last sync timestamp from gp_games
  const { rows: gameRows } = await pool.query<{ game_count: string; last_sync_at: string | null }>(
    `SELECT COUNT(*)::text AS game_count, MAX(updated_at)::text AS last_sync_at
     FROM gp_games WHERE provider_id = $1 AND is_active = TRUE`,
    [provider.id],
  );

  const brandConfig = bpRows[0] ? {
    brand_provider_id: bpRows[0].bp_id,
    brand_code:        bpRows[0].brand_code,
    status:            bpRows[0].bp_status,
    cred_count:        parseInt(bpRows[0].cred_count, 10),
    cfg_count:         parseInt(bpRows[0].cfg_count, 10),
    game_count:        parseInt(gameRows[0]?.game_count ?? '0', 10),
    last_sync_at:      gameRows[0]?.last_sync_at ?? null,
  } : null;

  return NextResponse.json({
    provider,
    config: cfgRows,
    credentials: credRows,
    recent_audit: auditRows,
    brand_config: brandConfig,
  });
}

/**
 * PATCH /api/games/settings/[code]
 * Upsert config key, credential key, or provider status.
 *
 * Permissions:
 *   - Config + Status changes: game.manage
 *   - Credential changes:      game.credentials (SuperAdmin only by default)
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  const body = await req.json() as {
    type?: 'config' | 'credential' | 'website';
    key?: string;
    value?: string;
    encrypt?: boolean;
    provider_status?: string;
    // Website display settings (bulk update)
    website?: {
      website_visible?: boolean;
      website_display_name?: string;
      website_logo_url?: string;
      website_banner_url?: string;
      website_category?: string;
      website_sort_order?: number;
      website_is_hot?: boolean;
      website_is_new?: boolean;
      website_maintenance?: boolean;
      website_launch_mode?: string;
      website_display_mode?: string;
    };
  };

  // Credential updates require elevated permission
  const isCredentialOp = body.type === 'credential';
  const requiredPerm = isCredentialOp ? 'game.credentials' : 'game.manage';
  const payload = await requirePermission(requiredPerm);
  if (!payload) {
    return NextResponse.json(
      { error: isCredentialOp ? 'Credential management requires game.credentials permission' : 'Unauthorized' },
      { status: 401 },
    );
  }

  const ip = getIp(req);
  const adminUsername = payload.username;
  const adminId = payload.sub;

  const { rows: provRows } = await pool.query<{ id: number; status: string }>(
    `SELECT id, status FROM gp_providers WHERE code = $1 LIMIT 1`,
    [upperCode],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

  const { id: providerId, status: currentStatus } = provRows[0];

  // ── Status change ─────────────────────────────────────────────────────────
  if (body.provider_status !== undefined) {
    const ALLOWED_STATUSES = ['ACTIVE', 'TESTING', 'DISABLED', 'MAINTENANCE'];
    if (!ALLOWED_STATUSES.includes(body.provider_status)) {
      return NextResponse.json({ error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` }, { status: 400 });
    }
    await pool.query(
      `UPDATE gp_providers SET status = $1, updated_at = NOW() WHERE id = $2`,
      [body.provider_status, providerId],
    );
    await writeAuditLog({
      providerId, providerCode: upperCode, adminId, adminUsername,
      action: 'STATUS_CHANGE',
      oldHint: currentStatus, newHint: body.provider_status, ip,
    });
    await takeHistorySnapshot({
      providerId, providerCode: upperCode, providerStatus: body.provider_status,
      adminId, adminUsername, summary: `Status changed: ${currentStatus} → ${body.provider_status}`,
    });
    return NextResponse.json({ ok: true });
  }

  // key/value only required for config/credential ops — website type uses body.website instead
  if (body.type !== 'website' && (!body.key || body.value === undefined)) {
    return NextResponse.json({ error: 'key and value are required' }, { status: 400 });
  }

  // ── Config update ─────────────────────────────────────────────────────────
  if (body.type === 'config') {
    const { rows: old } = await pool.query<{ value: string }>(
      `SELECT value FROM gp_config WHERE provider_id = $1 AND key = $2`, [providerId, body.key],
    );
    const oldHint = old[0]?.value ?? '—';

    await pool.query(
      `INSERT INTO gp_config (provider_id, key, value, updated_by, updated_by_name)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (provider_id, key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
             updated_by_name = EXCLUDED.updated_by_name, updated_at = NOW()`,
      [providerId, body.key, body.value, adminId, adminUsername],
    );
    await writeAuditLog({
      providerId, providerCode: upperCode, adminId, adminUsername,
      action: 'UPDATE_CONFIG', fieldKey: body.key,
      oldHint, newHint: body.value, ip,
    });
    await takeHistorySnapshot({
      providerId, providerCode: upperCode, providerStatus: currentStatus,
      adminId, adminUsername, summary: `Config updated: ${body.key}`,
    });
    return NextResponse.json({ ok: true });
  }

  // ── Credential update ─────────────────────────────────────────────────────
  if (body.type === 'credential') {
    const isEncrypted = body.encrypt === true;
    await pool.query(
      `INSERT INTO gp_credentials (provider_id, key, value, is_encrypted, updated_by, updated_by_name)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (provider_id, key) DO UPDATE
         SET value = EXCLUDED.value, is_encrypted = EXCLUDED.is_encrypted,
             updated_by = EXCLUDED.updated_by, updated_by_name = EXCLUDED.updated_by_name,
             updated_at = NOW()`,
      [providerId, body.key, body.value, isEncrypted, adminId, adminUsername],
    );
    await writeAuditLog({
      providerId, providerCode: upperCode, adminId, adminUsername,
      action: 'UPDATE_CREDENTIAL', fieldKey: body.key,
      oldHint: '(previous)', newHint: maskValue(body.value ?? ''), ip,
    });
    await takeHistorySnapshot({
      providerId, providerCode: upperCode, providerStatus: currentStatus,
      adminId, adminUsername, summary: `Credential updated: ${body.key}`,
    });
    return NextResponse.json({ ok: true });
  }

  // ── Website display settings update ──────────────────────────────────────
  if (body.type === 'website' && body.website) {
    const ws = body.website;
    const ALLOWED_CATEGORIES    = ['slot', 'live', 'sport', 'fishing'];
    const ALLOWED_LAUNCH_MODES  = ['LOBBY', 'DIRECT', 'MEGAAPP_DIALOG'];
    const ALLOWED_DISPLAY_MODES = ['PROVIDER_CARD', 'GAME_LIST', 'BOTH'];

    if (ws.website_category && !ALLOWED_CATEGORIES.includes(ws.website_category)) {
      return NextResponse.json({ error: `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(', ')}` }, { status: 400 });
    }
    if (ws.website_launch_mode && !ALLOWED_LAUNCH_MODES.includes(ws.website_launch_mode)) {
      return NextResponse.json({ error: `Invalid launch_mode. Allowed: ${ALLOWED_LAUNCH_MODES.join(', ')}` }, { status: 400 });
    }
    if (ws.website_display_mode && !ALLOWED_DISPLAY_MODES.includes(ws.website_display_mode)) {
      return NextResponse.json({ error: `Invalid display_mode. Allowed: ${ALLOWED_DISPLAY_MODES.join(', ')}` }, { status: 400 });
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 2;

    const fields: Array<[keyof typeof ws, string]> = [
      ['website_visible',      'website_visible'],
      ['website_display_name', 'website_display_name'],
      ['website_logo_url',     'website_logo_url'],
      ['website_banner_url',   'website_banner_url'],
      ['website_category',     'website_category'],
      ['website_sort_order',   'website_sort_order'],
      ['website_is_hot',       'website_is_hot'],
      ['website_is_new',       'website_is_new'],
      ['website_maintenance',  'website_maintenance'],
      ['website_launch_mode',  'website_launch_mode'],
      ['website_display_mode', 'website_display_mode'],
    ];

    for (const [wsKey, col] of fields) {
      if (ws[wsKey] !== undefined) {
        sets.push(`${col} = $${i++}`);
        vals.push(ws[wsKey]);
      }
    }

    if (sets.length === 0) return NextResponse.json({ ok: true });

    sets.push('updated_at = NOW()');
    await pool.query(
      `UPDATE gp_providers SET ${sets.join(', ')} WHERE id = $1`,
      [providerId, ...vals],
    );

    await writeAuditLog({
      providerId, providerCode: upperCode, adminId, adminUsername,
      action: 'UPDATE_WEBSITE_SETTINGS', ip,
      notes: `Updated: ${Object.keys(ws).join(', ')}`,
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'type must be config, credential, or website' }, { status: 400 });
}

/**
 * DELETE /api/games/settings/[code]
 * Removes a provider and all dependent rows.
 * Three protections (checked in order):
 *   1. Provider must not be ACTIVE
 *   2. No gp_games rows referencing this provider
 *   3. No gp_credentials rows for this provider
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;

  const { rows: provRows } = await pool.query<{ id: number; status: string }>(
    `SELECT id, status FROM gp_providers WHERE code = $1`,
    [code.toUpperCase()],
  );
  if (provRows.length === 0) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  }
  const { id: providerId, status: providerStatus } = provRows[0];

  // Protection 1: must not be ACTIVE
  if (providerStatus === 'ACTIVE') {
    return NextResponse.json(
      { error: 'Provider is currently active. Set status to DISABLED first.' },
      { status: 409 },
    );
  }

  // Protection 2: no games
  const { rows: gameCount } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM gp_games WHERE provider_id = $1`,
    [providerId],
  );
  if (parseInt(gameCount[0].cnt, 10) > 0) {
    return NextResponse.json(
      { error: `Cannot delete: provider has ${gameCount[0].cnt} game(s). Remove all games first.` },
      { status: 409 },
    );
  }

  // Protection 3: no credentials
  const { rows: credCount } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM gp_credentials WHERE provider_id = $1`,
    [providerId],
  );
  if (parseInt(credCount[0].cnt, 10) > 0) {
    return NextResponse.json(
      { error: `Cannot delete: provider has ${credCount[0].cnt} credential(s) configured. Clear credentials first.` },
      { status: 409 },
    );
  }

  // Guard 4: cannot delete provider that has brand configurations
  const { rows: brandRows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM brand_providers WHERE provider_id = $1`,
    [providerId],
  );
  if (parseInt(brandRows[0].cnt, 10) > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: provider is used in ${brandRows[0].cnt} brand configuration(s). Remove all brand-provider configurations first.`,
      },
      { status: 409 },
    );
  }

  // Delete in FK order
  await pool.query(`DELETE FROM gp_config_audit_log WHERE provider_id = $1`, [providerId]);
  await pool.query(`DELETE FROM gp_config_history  WHERE provider_id = $1`, [providerId]);
  await pool.query(`DELETE FROM gp_health_checks   WHERE provider_id = $1`, [providerId]);
  await pool.query(`DELETE FROM gp_credentials     WHERE provider_id = $1`, [providerId]);
  await pool.query(`DELETE FROM gp_config          WHERE provider_id = $1`, [providerId]);
  await pool.query(`DELETE FROM gp_providers       WHERE id = $1`,          [providerId]);

  return NextResponse.json({ ok: true });
}
