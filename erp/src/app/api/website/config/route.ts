import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getAllSettings, setSettings } from '@/lib/repositories/settings_repo';

const CONFIG_KEYS = [
  // Legacy currency (symbol string, e.g. "RM") — kept for backward compat
  'website_currency',
  'website_decimal_places',
  // New currency system (Single Source of Truth)
  'currency_code',         // ISO-4217 code, e.g. "MYR"
  'currency_symbol',       // Display symbol, e.g. "RM"  (auto-derived from code)
  'thousands_separator',   // "," | "." | " " | ""
  'decimal_separator',     // "." | ","
  // Deposit / Withdraw limits
  'deposit_min_amount',
  'withdraw_min_amount',
  'deposit_max_amount',
  'withdraw_max_amount',
  'wallet_max_balance_deposit',
  'max_withdrawals_per_day',
];

export async function GET() {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const all = await getAllSettings();
  const config: Record<string, string> = {};
  for (const s of all) {
    if (CONFIG_KEYS.includes(s.key)) config[s.key] = s.value;
  }
  return NextResponse.json(config);
}

export async function PATCH(req: NextRequest) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, string>;

  const updates: Record<string, string> = {};
  for (const key of CONFIG_KEYS) {
    if (key in body) updates[key] = body[key];
  }

  // Keep website_currency in sync with currency_symbol for backward compat
  if ('currency_symbol' in updates && !('website_currency' in updates)) {
    updates['website_currency'] = updates['currency_symbol'];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid keys' }, { status: 400 });
  }

  await setSettings(updates, payload.username ?? 'admin');
  return NextResponse.json({ ok: true });
}
