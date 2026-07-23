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
            metadata, created_at, updated_at
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

  return NextResponse.json({
    provider,
    config: cfgRows,
    credentials: credRows,
    recent_audit: auditRows,
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
    type?: 'config' | 'credential';
    key?: string;
    value?: string;
    encrypt?: boolean;
    provider_status?: string;
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

  if (!body.key || body.value === undefined) {
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
      oldHint: '(previous)', newHint: maskValue(body.value), ip,
    });
    await takeHistorySnapshot({
      providerId, providerCode: upperCode, providerStatus: currentStatus,
      adminId, adminUsername, summary: `Credential updated: ${body.key}`,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'type must be config or credential' }, { status: 400 });
}
