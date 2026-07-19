import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { scanRisks } from '@/lib/repositories/risk_repo';

export async function GET() {
  const payload = await requirePermission('risk.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await scanRisks();
  return NextResponse.json(result);
}
