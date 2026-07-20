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

export async function GET() {
  try {
    const res = await pool.query<{ key: string; value: string }>(
      'SELECT key, value FROM system_settings WHERE key = ANY($1)',
      [WEBSITE_KEYS]
    );
    const settings = Object.fromEntries(res.rows.map(r => [r.key, r.value]));
    return NextResponse.json(settings, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({});
  }
}
