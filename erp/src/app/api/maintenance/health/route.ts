import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { mediaService } from '@/lib/media';
import type { StorageHealth } from '@/lib/media/types';

const BOT_RELAY_URL        = process.env.BOT_RELAY_URL        ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function GET() {
  const [dbCheck, relayCheck, storageCheck] = await Promise.all([
    checkDatabase(),
    checkRelay(),
    checkStorage(),
  ]);

  const overallOk = dbCheck.ok && relayCheck.ok && storageCheck.ok;
  return NextResponse.json({
    status:    overallOk ? 'ok' : (dbCheck.ok || relayCheck.ok ? 'degraded' : 'down'),
    checks:    { database: dbCheck, bot_relay: relayCheck, storage: storageCheck },
    timestamp: new Date().toISOString(),
  });
}

async function checkDatabase(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  }
}

async function checkStorage(): Promise<{ ok: boolean; status: StorageHealth; error?: string }> {
  try {
    const status = await mediaService.getStorageProvider().health();
    return { ok: status === 'ONLINE', status };
  } catch (e) {
    return { ok: false, status: 'OFFLINE', error: String(e) };
  }
}

type RelayHealthBody = {
  ok?: boolean;
  version?: string;
  uptime_seconds?: number;
  settings_keys?: number;
  telegram?: {
    ok: boolean;
    username?: string | null;
    latency_ms?: number;
    error?: string;
  };
};

async function checkRelay(): Promise<{
  ok: boolean;
  latency_ms: number;
  version?: string;
  uptime_seconds?: number;
  telegram?: RelayHealthBody['telegram'];
  error?: string;
}> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${BOT_RELAY_URL}/health`, {
      headers: { Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      signal:  controller.signal,
    }).finally(() => clearTimeout(timer));
    const latency_ms = Date.now() - start;
    if (!r.ok) return { ok: false, latency_ms };
    const body = await r.json().catch(() => ({})) as RelayHealthBody;
    return {
      ok:             true,
      latency_ms,
      version:        body.version,
      uptime_seconds: body.uptime_seconds,
      telegram:       body.telegram,
    };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  }
}
