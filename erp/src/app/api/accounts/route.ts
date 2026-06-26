import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import {
  getAccounts,
  getAccountStats,
  getProviders,
  bulkImportAccounts,
} from '@/lib/repositories/account_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const provider = searchParams.get('provider') || undefined;
  const status   = searchParams.get('status')   || undefined;
  const search   = searchParams.get('search')   || undefined;
  const page     = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10));
  const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const offset   = (page - 1) * limit;

  const [{ accounts, total }, stats, providers] = await Promise.all([
    getAccounts({ provider, status, search, limit, offset }),
    getAccountStats(),
    getProviders(),
  ]);

  return NextResponse.json({ accounts, total, stats, providers, page, limit });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { rows?: { provider: string; username: string; password: string }[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'rows array is required and must not be empty' }, { status: 400 });
  }

  const valid = body.rows.filter((r) => r.provider?.trim() && r.username?.trim());
  if (valid.length === 0) {
    return NextResponse.json({ error: 'No valid rows (provider + username required)' }, { status: 400 });
  }

  const inserted = await bulkImportAccounts(valid);
  logAudit({
    admin_id: payload.sub,
    action: 'ACCOUNT_BULK_IMPORTED',
    target_type: 'account_pool',
    target_id: null,
    new_value: { inserted },
  }).catch(() => {});
  return NextResponse.json({ inserted }, { status: 201 });
}
