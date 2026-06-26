import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getRiskFlags, getRiskFlagStats, createRiskFlag } from '@/lib/repositories/risk_repo';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = request.nextUrl.searchParams.get('status') ?? undefined;
  const [flags, stats] = await Promise.all([
    getRiskFlags(status),
    getRiskFlagStats(),
  ]);
  return NextResponse.json({ flags, stats });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
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

  return NextResponse.json(flag, { status: 201 });
}
