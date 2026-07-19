import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

interface HealthStatus {
  database: { ok: boolean; latency_ms: number };
  relay: { ok: boolean; latency_ms: number };
  storage: { ok: boolean; total_files: number; total_bytes: number };
  timestamp: string;
}

export async function GET() {
  const authPayload = await requirePermission('dashboard.view');
  if (!authPayload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';

  // ── Database ping ───────────────────────────────────────────────────────
  let dbOk = false;
  let dbLatency = 0;
  try {
    const t0 = Date.now();
    await pool.query('SELECT 1 AS ok');
    dbOk = true;
    dbLatency = Date.now() - t0;
  } catch {
    dbOk = false;
  }

  // ── Relay ping (parallel with storage) ───────────────────────────────────
  let relayOk = false;
  let relayLatency = 0;
  let storageFiles = 0;
  let storageBytes = 0;

  const [relayResult, storageResult] = await Promise.allSettled([
    (async () => {
      const t0 = Date.now();
      const res = await fetch(`${RELAY_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return { ok: res.ok || res.status === 404, latency: Date.now() - t0 };
    })(),
    pool.query<{ files: number; bytes: string }>(
      `SELECT COUNT(*)::int AS files, COALESCE(SUM(file_size),0)::bigint AS bytes
       FROM media_library WHERE deleted_at IS NULL`
    ),
  ]);

  if (relayResult.status === 'fulfilled') {
    relayOk = relayResult.value.ok;
    relayLatency = relayResult.value.latency;
  }
  if (storageResult.status === 'fulfilled') {
    storageFiles = storageResult.value.rows[0].files;
    storageBytes = Number(storageResult.value.rows[0].bytes);
  }

  const health: HealthStatus = {
    database: { ok: dbOk, latency_ms: dbLatency },
    relay:    { ok: relayOk, latency_ms: relayLatency },
    storage:  { ok: storageResult.status === 'fulfilled', total_files: storageFiles, total_bytes: storageBytes },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(health);
}
