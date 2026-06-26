import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import {
  getProviderById,
  updateProvider,
  deleteProvider,
} from '@/lib/repositories/provider_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['SUPER_ADMIN', 'ADMIN'].includes(payload.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const numId = parseInt(id, 10);

  let body: {
    display_name?: string;
    description?: string | null;
    logo_url?: string | null;
    status?: string;
    sort_order?: number;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const existing = await getProviderById(numId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await updateProvider(numId, body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  logAudit({
    admin_id: payload.sub,
    action: 'PROVIDER_UPDATED',
    target_type: 'provider',
    target_id: numId,
    new_value: body,
  }).catch(() => {});
  return NextResponse.json({ provider: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (payload.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const numId = parseInt(id, 10);

  const existing = await getProviderById(numId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await deleteProvider(numId);
  logAudit({
    admin_id: payload.sub,
    action: 'PROVIDER_DISABLED',
    target_type: 'provider',
    target_id: numId,
    new_value: null,
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
