import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StoreTxRow {
  id:       string;
  phone:    string;
  amount:   number;
  provider: string;
  ts:       number;
}

interface TxStore {
  deposits:    StoreTxRow[];
  withdrawals: StoreTxRow[];
}

// ── Module-level in-memory cache (single-process speed layer) ─────────────────
// Populated from DB on first request; survives hot reloads within the same
// worker process. Multiple worker processes each get their own cache but all
// read/write from the same DB row → consistent shared feed.

let _cache:    TxStore | null = null;
let _counter = 1;

// DB persistence key
const STORE_KEY = 'live_tx_store';

// Provider cache (60-second TTL)
let _providerCache:    string[] = [];
let _providerCacheTTL = 0;

// ── Provider loader ────────────────────────────────────────────────────────────

async function loadProviders(): Promise<string[]> {
  if (Date.now() < _providerCacheTTL && _providerCache.length > 0) {
    return _providerCache;
  }
  try {
    const res = await pool.query<{ provider_name: string }>(
      `SELECT provider_name FROM website_game_providers
       WHERE is_active = TRUE
       ORDER BY display_order ASC, id ASC`
    );
    if (res.rows.length > 0) {
      _providerCache    = res.rows.map(r => r.provider_name);
      _providerCacheTTL = Date.now() + 60_000;
    }
  } catch { /* keep existing cache on error */ }
  return _providerCache;
}

// ── DB persistence ─────────────────────────────────────────────────────────────

async function loadStoreFromDB(): Promise<TxStore | null> {
  try {
    const res = await pool.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = $1`,
      [STORE_KEY]
    );
    if (res.rows[0]?.value) {
      return JSON.parse(res.rows[0].value) as TxStore;
    }
  } catch { /* ignore, treat as empty */ }
  return null;
}

function saveStoreToDB(store: TxStore): void {
  // Fire-and-forget: non-blocking write so response is not delayed
  pool.query(
    `INSERT INTO system_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, 'system', NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [STORE_KEY, JSON.stringify(store)]
  ).catch(() => { /* silent — transient DB errors should not break the feed */ });
}

// ── Generation helpers ─────────────────────────────────────────────────────────

const GEN_PREFIXES = ['601','6011','6012','6013','6014','6015','6016','6017','6018','6019'];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function genPhone(): string {
  const prefix = randPick(GEN_PREFIXES);
  const rest   = String(randInt(10000000, 99999999)).slice(0, 8 - (prefix.length - 3));
  const digits = prefix + rest;
  return digits.slice(0, 4) + '*'.repeat(5) + digits.slice(-3);
}

const DEP_POOLS = [
  [30, 50, 100, 150, 200, 300, 500],
  [500, 600, 700, 800, 1000, 1200, 1500, 2000],
  [1000, 2000, 3000, 5000],
  [10000, 20000, 50000],
];
const WTH_POOLS = [
  [100, 150, 200, 300, 500, 800],
  [500, 800, 1000, 1500, 2000],
  [2000, 3000, 5000],
  [5000, 10000, 20000],
];

function genAmount(isDeposit: boolean): number {
  const pools = isDeposit ? DEP_POOLS : WTH_POOLS;
  const roll  = Math.random();
  const pool  = roll < 0.50 ? pools[0] : roll < 0.85 ? pools[1] : roll < 0.97 ? pools[2] : pools[3];
  return Math.round(randPick(pool) / 50) * 50 || 100;
}

function genRow(isDeposit: boolean, providers: string[]): StoreTxRow {
  const provPool = providers.length > 0 ? providers : ['---'];
  return {
    id:       `${isDeposit ? 'sd' : 'sw'}${_counter++}`,
    phone:    genPhone(),
    amount:   genAmount(isDeposit),
    provider: randPick(provPool),
    ts:       Date.now(),
  };
}

function initStore(n: number, providers: string[]): TxStore {
  const now = Date.now();
  let depAgo = 0;
  let wthAgo = 0;
  return {
    deposits: Array.from({ length: n }, () => {
      const row = { ...genRow(true, providers), ts: now - depAgo };
      depAgo += randInt(8000, 35000);
      return row;
    }),
    withdrawals: Array.from({ length: n }, () => {
      const row = { ...genRow(false, providers), ts: now - wthAgo };
      wthAgo += randInt(15000, 60000);
      return row;
    }),
  };
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const maxRows        = Math.min(20, Math.max(1, parseInt(sp.get('max_rows') ?? '8', 10) || 8));
  const depositChance  = parseFloat(sp.get('dep_chance') ?? '70');
  const withdrawChance = parseFloat(sp.get('wth_chance') ?? '25');

  // Prefer client-supplied providers (ERP custom_list config); fall back to DB lookup
  const rawParam        = sp.get('providers') ?? '';
  const clientProviders = rawParam.split(',').map(s => s.trim()).filter(Boolean);
  const providers       = clientProviders.length > 0 ? clientProviders : await loadProviders();

  // Load store: in-memory cache first, then DB, then init
  if (!_cache) {
    const dbStore = await loadStoreFromDB();
    if (dbStore) {
      // Check if the stored data has placeholder '---' providers.
      // If we now have real providers, invalidate the stale DB data.
      const allRows = [...dbStore.deposits, ...dbStore.withdrawals];
      const hasStale = allRows.some(r => r.provider === '---');
      if (hasStale && providers.length > 0) {
        // Re-initialize with real providers and overwrite DB
        _cache = initStore(maxRows, providers);
        saveStoreToDB(_cache);
        return NextResponse.json(
          { deposits: _cache.deposits.slice(0, maxRows), withdrawals: _cache.withdrawals.slice(0, maxRows) },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      _cache = dbStore;
      // Sync _counter past all existing IDs to avoid collisions
      const allIds = [..._cache.deposits, ..._cache.withdrawals].map(r => r.id);
      const maxNum = allIds.reduce((m, id) => {
        const n = parseInt(id.replace(/[a-z]/g, ''), 10);
        return isNaN(n) ? m : Math.max(m, n);
      }, 0);
      if (maxNum >= _counter) _counter = maxNum + 1;
    } else {
      // First-ever request: generate initial dataset and persist it
      _cache = initStore(maxRows, providers);
      saveStoreToDB(_cache);
      return NextResponse.json(
        { deposits: _cache.deposits.slice(0, maxRows), withdrawals: _cache.withdrawals.slice(0, maxRows) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }

  // Tick: probabilistically insert one new row per type at the top
  let { deposits, withdrawals } = _cache;

  if (Math.random() * 100 < depositChance) {
    deposits = [genRow(true, providers), ...deposits].slice(0, maxRows);
  }

  if (Math.random() * 100 < withdrawChance) {
    withdrawals = [genRow(false, providers), ...withdrawals].slice(0, maxRows);
  }

  _cache = { deposits, withdrawals };

  // Persist to DB (non-blocking, shared across all worker processes)
  saveStoreToDB(_cache);

  return NextResponse.json(
    { deposits: deposits.slice(0, maxRows), withdrawals: withdrawals.slice(0, maxRows) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
