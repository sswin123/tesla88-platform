import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { createGamingPlatform } from '@/lib/providers';
import { RuntimeEventStore } from '@/lib/providers/core/RuntimeEventStore';

type Params = { params: Promise<{ code: string; providerCode: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, providerCode } = await params;
  const brandCode = code.toUpperCase();
  const provider  = providerCode.toUpperCase();
  const limit     = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10), 100);

  // Ensure adapter registry is initialized
  createGamingPlatform();

  const events = RuntimeEventStore.getEvents(brandCode, provider, limit);
  return NextResponse.json({ brand: brandCode, provider, events, count: events.length });
}
