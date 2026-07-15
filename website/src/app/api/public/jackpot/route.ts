import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// ── Jackpot Server-Side State API ─────────────────────────────────────────────
//
// GET  /api/public/jackpot?id=xxx&initial=1000000&rate=3.5
//   → { value: number, synced_at: number }
//   Computes: stored_base + (now - base_time) * rate
//   Persists base state in system_settings so all workers share one feed.
//
// The client polls this endpoint at sync_interval seconds.
// Between polls the client increments locally for smooth display.

function stateKey(id: string): string {
  return `jackpot_state_${id.replace(/[^a-z0-9_-]/gi, '_')}`;
}

interface JackpotState {
  base_value:    number;
  base_time:     number; // Unix seconds (float)
  rate:          number; // increment per second
  initial_value: number; // tracks config's initial_value; reset when changed
}

async function readState(key: string): Promise<JackpotState | null> {
  try {
    const res = await pool.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = $1`, [key]
    );
    if (res.rows[0]?.value) return JSON.parse(res.rows[0].value) as JackpotState;
  } catch { /* ignore */ }
  return null;
}

async function writeState(key: string, state: JackpotState): Promise<void> {
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, 'system', NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, JSON.stringify(state)]
  );
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams;
  const id      = (sp.get('id') ?? 'default').slice(0, 64);
  const initial = parseFloat(sp.get('initial') ?? '1000000') || 1_000_000;
  const rate    = parseFloat(sp.get('rate')    ?? '3.5')     || 3.5;

  const key    = stateKey(id);
  const nowSec = Date.now() / 1000;

  try {
    let state = await readState(key);

    if (!state) {
      // First-ever request for this counter — initialise and persist
      state = { base_value: initial, base_time: nowSec, rate, initial_value: initial };
      await writeState(key, state);
      return NextResponse.json(
        { value: initial, synced_at: nowSec },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Detect ERP config change: initial_value changed → reset counter to new value
    const storedInitial = (state as JackpotState).initial_value ?? -1;
    if (Math.abs(storedInitial - initial) > 0.001) {
      state = { base_value: initial, base_time: nowSec, rate, initial_value: initial };
      await writeState(key, state);
      return NextResponse.json(
        { value: initial, synced_at: nowSec },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const elapsed = nowSec - state.base_time;
    const current = state.base_value + elapsed * state.rate;

    return NextResponse.json(
      { value: current, synced_at: nowSec },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    // On DB error: compute without persistence (still better than resetting)
    return NextResponse.json(
      { value: initial, synced_at: nowSec },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

// ── PATCH (internal use by ERP reset) ─────────────────────────────────────────
// Called by ERP /api/jackpot which handles auth. This route is NOT auth-guarded
// but only called server-to-server, not from the browser.

export async function PATCH(req: NextRequest) {
  const secret = req.headers.get('x-jackpot-secret');
  const internalSecret = process.env.INTERNAL_API_SECRET ?? 'jackpot_internal';
  if (secret !== internalSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { id: string; value: number; rate: number };
  const key  = stateKey(body.id ?? 'default');
  const nowSec = Date.now() / 1000;

  const state: JackpotState = {
    base_value:    body.value ?? 1_000_000,
    base_time:     nowSec,
    rate:          body.rate  ?? 3.5,
    initial_value: body.value ?? 1_000_000,
  };

  await writeState(key, state);
  return NextResponse.json({ ok: true, ...state });
}
