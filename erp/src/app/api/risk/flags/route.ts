import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getRiskFlags, getRiskFlagStats, createRiskFlag } from '@/lib/repositories/risk_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function GET(request: NextRequest) {
  const payload = await requirePermission('risk.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = request.nextUrl.searchParams.get('status') ?? undefined;
  const [flags, stats] = await Promise.all([
    getRiskFlags(status),
    getRiskFlagStats(),
  ]);
  return NextResponse.json({ flags, stats });
}

export async function POST(request: NextRequest) {
  const payload = await requirePermission('risk.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as {
    user_id: number;
    risk_type: string;
    severity?: string;
    note?: string;
    status?: string;
  };

  if (!body.user_id || !body.risk_type) {
    return NextResponse.json({ error: 'user_id and risk_type are required' }, { status: 400 });
  }

  const flag = await createRiskFlag({
    user_id: body.user_id,
    risk_type: body.risk_type,
    severity: body.severity ?? 'MEDIUM',
    note: body.note,
    flagged_by: payload.username,
    status: body.status ?? 'OPEN',
  });
  logAudit({
    admin_id: payload.sub,
    action: 'RISK_FLAG_CREATED',
    target_type: 'risk_flag',
    target_id: flag.id,
    new_value: { user_id: body.user_id, risk_type: body.risk_type, severity: body.severity ?? 'MEDIUM' },
  }).catch(() => {});
  return NextResponse.json(flag, { status: 201 });
}
