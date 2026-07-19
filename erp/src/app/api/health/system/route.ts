import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export async function GET() {
  const authPayload = await requirePermission('dashboard.view');
  if (!authPayload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const BOT_RELAY_URL = process.env.BOT_RELAY_URL ?? 'http://localhost:8090';
  const WEBSITE_URL   = process.env.WEBSITE_URL   ?? '';
  const APP_VERSION   = process.env.APP_VERSION   ?? '1.0.0';

  const [dbCheck, botCheck, websiteCheck] = await Promise.all([
    checkDatabase(),
    checkBot(BOT_RELAY_URL),
    checkWebsite(WEBSITE_URL),
  ]);

  return NextResponse.json({
    database: dbCheck,
    services: {
      erp:     { ok: true, latency_ms: 0 },
      website: websiteCheck,
      bot:     botCheck,
    },
    version:   APP_VERSION,
    timestamp: new Date().toISOString(),
  });
}

async function checkDatabase(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - t0, error: String(e) };
  }
}

async function checkBot(relayUrl: string): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${relayUrl}/health`, { signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
    return { ok: r.ok || r.status === 404, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - t0, error: String(e) };
  }
}

async function checkWebsite(websiteUrl: string): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  if (!websiteUrl) return { ok: false, latency_ms: 0, error: 'WEBSITE_URL not configured' };
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${websiteUrl}/api/public/health`, { signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
    return { ok: r.ok || r.status === 404, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - t0, error: String(e) };
  }
}
