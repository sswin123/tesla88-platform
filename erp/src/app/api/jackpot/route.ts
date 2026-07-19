import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

// ── ERP Jackpot Admin API ─────────────────────────────────────────────────────
//
// GET  /api/jackpot?id=xxx          → { current_value, state }
// PATCH /api/jackpot                → { id, value, rate } → reset to new value

function stateKey(id: string): string {
  return `jackpot_state_${id.replace(/[^a-z0-9_-]/gi, '_')}`;
}

interface JackpotState {
  base_value: number;
  base_time:  number;
  rate:       number;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const id  = (req.nextUrl.searchParams.get('id') ?? 'default').slice(0, 64);
  const key = stateKey(id);
  const nowSec = Date.now() / 1000;

  try {
    const res = await pool.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = $1`, [key]
    );

    if (res.rows[0]?.value) {
      const state   = JSON.parse(res.rows[0].value) as JackpotState;
      const elapsed = nowSec - state.base_time;
      const current = state.base_value + elapsed * state.rate;
      return NextResponse.json({ current_value: current, state });
    }

    return NextResponse.json({ current_value: null, state: null });
  } catch {
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

// ── PATCH — reset / update value ──────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body   = await req.json() as { id?: string; value?: number; rate?: number };
  const id     = (body.id ?? 'default').slice(0, 64);
  const value  = typeof body.value === 'number' ? body.value : 1_000_000;
  const key    = stateKey(id);
  const nowSec = Date.now() / 1000;

  // Preserve existing rate if not specified
  let rate = body.rate;
  if (rate === undefined) {
    try {
      const existing = await pool.query<{ value: string }>(
        `SELECT value FROM system_settings WHERE key = $1`, [key]
      );
      if (existing.rows[0]?.value) {
        const s = JSON.parse(existing.rows[0].value) as JackpotState;
        rate = s.rate;
      }
    } catch { /* ignore */ }
  }
  rate = rate ?? 3.5;

  const state: JackpotState = { base_value: value, base_time: nowSec, rate };

  await pool.query(
    `INSERT INTO system_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    [key, JSON.stringify(state), payload.username]
  );

  return NextResponse.json({ ok: true, value, rate });
}
