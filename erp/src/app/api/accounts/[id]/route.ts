import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { reassignAccount, updateAccountStatus } from '@/lib/repositories/account_repo';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const accountId = parseInt(id, 10);
  if (isNaN(accountId)) {
    return NextResponse.json({ error: 'Invalid account id' }, { status: 400 });
  }

  let body: { assigned_user_id?: number | null; status?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if ('assigned_user_id' in body) {
    const newUserId = body.assigned_user_id ?? null;
    await reassignAccount(accountId, newUserId);
    return NextResponse.json({ ok: true });
  }

  if (body.status) {
    const allowed = ['AVAILABLE', 'ASSIGNED', 'DISABLED'];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of ${allowed.join(', ')}` }, { status: 400 });
    }
    await updateAccountStatus(accountId, body.status);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Provide assigned_user_id or status' }, { status: 400 });
}
