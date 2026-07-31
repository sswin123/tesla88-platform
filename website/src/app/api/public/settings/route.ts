import { NextResponse } from 'next/server';
import pool from '@/lib/db';

const WEBSITE_KEYS = [
  // Deposit / Withdrawal limits
  'deposit_min_amount', 'withdraw_min_amount', 'deposit_max_amount', 'withdraw_max_amount',
  // Wallet
  'wallet_max_balance_deposit', 'website_currency', 'website_decimal_places',
  // Currency (Single Source of Truth)
  'currency_code', 'currency_symbol', 'thousands_separator', 'decimal_separator',
  // Withdrawal limit
  'max_withdrawals_per_day',
  // Registration control
  'website_registration',
];

// 30-second module-level cache — MemberPanel fetches this on every page load
// (it lives in the sidebar shown across all routes). Without caching, every
// concurrent page load hits DB, compounding pool pressure from game-lobby.
let _settingsCache: Record<string, string> | null = null;
let _settingsCacheAt = 0;
const SETTINGS_TTL_MS = 30_000;

export async function GET() {
  if (_settingsCache && Date.now() - _settingsCacheAt < SETTINGS_TTL_MS) {
    return NextResponse.json(_settingsCache, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const res = await pool.query<{ key: string; value: string }>(
      'SELECT key, value FROM system_settings WHERE key = ANY($1)',
      [WEBSITE_KEYS]
    );
    _settingsCache   = Object.fromEntries(res.rows.map(r => [r.key, r.value]));
    _settingsCacheAt = Date.now();
    return NextResponse.json(_settingsCache, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({});
  }
}
