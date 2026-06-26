// GET — no auth required (public health endpoint is common)
// Returns health status of database and bot relay
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

export async function GET() {
  const dbCheck = await checkDatabase();
  const relayCheck = await checkRelay();
  const overallOk = dbCheck.ok && relayCheck.ok;
  return NextResponse.json({
    status: overallOk ? 'ok' : (dbCheck.ok || relayCheck.ok ? 'degraded' : 'down'),
    checks: { database: dbCheck, bot_relay: relayCheck },
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

async function checkRelay(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${BOT_RELAY_URL}/health`, {
      headers: { Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    return { ok: r.ok, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: String(e) };
  }
}
