import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs } from '@/lib/repositories/audit_repo';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const page        = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit       = 50;
  const offset      = (page - 1) * limit;
  const target_type = searchParams.get('target_type') ?? undefined;

  const { data, total } = await getAuditLogs({ limit, offset, target_type });
  return NextResponse.json({ data, total, page, limit });
}
