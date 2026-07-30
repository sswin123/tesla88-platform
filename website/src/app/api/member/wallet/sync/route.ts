// POST /api/member/wallet/sync
//
// Member-authenticated endpoint: triggers a Transfer Out sync for all TRANSFER-wallet
// providers, returning any balance still held in the provider account back to the
// member's main wallet. Called by the Refresh button in MemberPanel.
import { NextResponse } from 'next/server';
import { getMember } from '@/lib/member-auth';

const ERP_INTERNAL_URL = (process.env.ERP_INTERNAL_URL ?? '').replace(/\/$/, '');

export async function POST(): Promise<NextResponse> {
  const member = await getMember();
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const internalToken = process.env.BOT_RELAY_AUTH_TOKEN ?? '';
  if (!ERP_INTERNAL_URL || !internalToken) {
    console.error('[wallet/sync] ERP_INTERNAL_URL or BOT_RELAY_AUTH_TOKEN not configured');
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  let erpRes: Response;
  try {
    erpRes = await fetch(`${ERP_INTERNAL_URL}/api/internal/member-wallet-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${internalToken}`,
      },
      body: JSON.stringify({ user_id: member.sub }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[wallet/sync] ERP request failed: ${msg}`);
    return NextResponse.json({ error: 'Sync request failed' }, { status: 502 });
  }

  if (!erpRes.ok) {
    const text = await erpRes.text().catch(() => '');
    console.error(`[wallet/sync] ERP returned ${erpRes.status}: ${text.slice(0, 200)}`);
    return NextResponse.json({ error: 'Sync failed' }, { status: 502 });
  }

  const data = await erpRes.json() as { synced: unknown[] };
  return NextResponse.json(data);
}
