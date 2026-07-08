import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs } from '@/lib/repositories/audit_repo';
import { requirePermission } from '@/lib/require_permission';

export async function GET(request: NextRequest) {
  const payload = await requirePermission('audit.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = request.nextUrl;
  const page        = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit       = 50;
  const offset      = (page - 1) * limit;
  const target_type = searchParams.get('target_type') ?? undefined;

  const { data, total } = await getAuditLogs({ limit, offset, target_type });
  return NextResponse.json({ data, total, page, limit });
}
