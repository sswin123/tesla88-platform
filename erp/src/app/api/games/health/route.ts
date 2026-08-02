import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import pool from '@/lib/db';
import { createGamingPlatform } from '@/lib/providers';

interface ComponentStatus {
  ok:      boolean;
  latency_ms?: number;
  detail?: string;
}

interface GamingHealthReport {
  overall:             'HEALTHY' | 'DEGRADED' | 'DOWN';
  database:            ComponentStatus;
  gp_tables:           ComponentStatus;
  kiss918_provider:    ComponentStatus & { status?: string };
  kiss918_adapter:     ComponentStatus;
  idempotency_table:   ComponentStatus;
  retry_queue:         ComponentStatus & { pending?: number };
  timestamp:           string;
}

export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const report: GamingHealthReport = {
    overall:             'HEALTHY',
    database:            { ok: false },
    gp_tables:           { ok: false },
    kiss918_provider:    { ok: false },
    kiss918_adapter:     { ok: false },
    idempotency_table:   { ok: false },
    retry_queue:         { ok: false },
    timestamp:           new Date().toISOString(),
  };

  // ── 1. DB connectivity ─────────────────────────────────────────────────────
  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    report.database = { ok: true, latency_ms: Date.now() - t0 };
  } catch (err) {
    report.database = { ok: false, detail: String(err) };
  }

  // ── 2. gp_* table presence (all 7 Phase G1 tables) ───────────────────────
  try {
    const { rows } = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'gp_providers','gp_credentials','gp_config','gp_players',
          'gp_games','gp_health_checks','gp_retry_queue'
        )
    `);
    const found = parseInt(rows[0]?.count ?? '0', 10);
    report.gp_tables = {
      ok:     found === 7,
      detail: `${found}/7 gp_* tables present`,
    };
  } catch (err) {
    report.gp_tables = { ok: false, detail: String(err) };
  }

  // ── 3. 918KISS provider record (catalog metadata check) ───────────────────
  try {
    const { rows } = await pool.query<{ status: string; health_status: string }>(
      `SELECT status, health_status FROM gp_providers WHERE code = '918KISS' LIMIT 1`,
    );
    const prov = rows[0];
    if (prov) {
      report.kiss918_provider = {
        ok:     prov.status === 'ACTIVE',
        status: prov.status,
        detail: `health_status=${prov.health_status}`,
      };
    } else {
      report.kiss918_provider = { ok: false, detail: 'Row not found in gp_providers' };
    }
  } catch (err) {
    report.kiss918_provider = { ok: false, detail: String(err) };
  }

  // ── 4. 918KISS adapter via brand framework ────────────────────────────────
  try {
    const { rows: bpRows } = await pool.query<{ brand_code: string }>(
      `SELECT b.code AS brand_code
       FROM brand_providers bp
       JOIN brands b       ON b.id = bp.brand_id
       JOIN gp_providers p ON p.id = bp.provider_id
       WHERE UPPER(p.code) = '918KISS' AND bp.status IN ('ACTIVE', 'TESTING')
       LIMIT 1`,
    );
    if (!bpRows[0]) {
      report.kiss918_adapter = { ok: false, detail: 'No active brand configuration for 918KISS' };
    } else {
      const platform = createGamingPlatform();
      const adapter = await platform.brandManager.getAdapter(bpRows[0].brand_code, '918KISS');
      report.kiss918_adapter = {
        ok:     adapter !== null,
        detail: adapter ? 'Adapter loaded via brand framework' : 'Adapter null',
      };
    }
  } catch (err) {
    report.kiss918_adapter = { ok: false, detail: String(err) };
  }

  // ── 5. Idempotency table ──────────────────────────────────────────────────
  try {
    await pool.query(`SELECT 1 FROM provider_callback_idempotency LIMIT 1`);
    report.idempotency_table = { ok: true };
  } catch (err) {
    report.idempotency_table = { ok: false, detail: String(err) };
  }

  // ── 6. Retry queue ────────────────────────────────────────────────────────
  try {
    const { rows } = await pool.query<{ pending: string }>(
      `SELECT COUNT(*)::int AS pending FROM gp_retry_queue WHERE status = 'PENDING'`,
    );
    const pending = parseInt(rows[0]?.pending ?? '0', 10);
    report.retry_queue = { ok: true, pending };
  } catch (err) {
    report.retry_queue = { ok: false, detail: String(err) };
  }

  // ── Overall status ────────────────────────────────────────────────────────
  const critical = [
    report.database.ok,
    report.gp_tables.ok,
    report.idempotency_table.ok,
  ];
  const advisory = [
    report.kiss918_provider.ok,
    report.kiss918_adapter.ok,
    report.retry_queue.ok,
  ];
  if (critical.some((v) => !v)) {
    report.overall = 'DOWN';
  } else if (advisory.some((v) => !v)) {
    report.overall = 'DEGRADED';
  } else {
    report.overall = 'HEALTHY';
  }

  const status = report.overall === 'DOWN' ? 503 : 200;
  return NextResponse.json(report, { status });
}
