import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getMemberAnalytics } from '@/lib/repositories/analytics_repo';

// GET /api/analytics
export async function GET() {
  const payload = await requirePermission('analytics.view');
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await getMemberAnalytics();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[analytics] DB error:', err);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
