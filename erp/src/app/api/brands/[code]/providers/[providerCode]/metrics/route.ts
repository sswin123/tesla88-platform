import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { createGamingPlatform } from '@/lib/providers';
import { RuntimeMetricsStore } from '@/lib/providers/core/RuntimeMetricsStore';

type Params = { params: Promise<{ code: string; providerCode: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, providerCode } = await params;
  const brandCode    = code.toUpperCase();
  const provider     = providerCode.toUpperCase();

  // Ensure adapter registry is initialized
  createGamingPlatform();

  const metrics = RuntimeMetricsStore.getMetrics(brandCode, provider);
  return NextResponse.json({ brand: brandCode, provider, metrics });
}
