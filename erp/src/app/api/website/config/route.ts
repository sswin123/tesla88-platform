import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getAllSettings, setSettings } from '@/lib/repositories/settings_repo';

const CONFIG_KEYS = [
  'deposit_min_amount',
  'withdraw_min_amount',
  'deposit_max_amount',
  'withdraw_max_amount',
  'wallet_max_balance_deposit',
  'website_currency',
  'website_decimal_places',
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

  // Only allow known config keys
  const updates: Record<string, string> = {};
  for (const key of CONFIG_KEYS) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid keys' }, { status: 400 });
  }

  await setSettings(updates, payload.username ?? 'admin');
  return NextResponse.json({ ok: true });
}
