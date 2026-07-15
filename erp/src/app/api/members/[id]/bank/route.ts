import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { logAudit } from '@/lib/repositories/audit_repo';
import { requirePermission } from '@/lib/require_permission';

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('member.bank.edit');
  if (!payload) return NextResponse.json({ error: 'Unauthorized — requires member.bank.edit permission' }, { status: 401 });

  const { id } = await params;
  const uid = parseInt(id, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json() as {
    bank_name?: string;
    bank_account?: string;
    bank_holder_name?: string;
    reason?: string;
  };
  const { bank_name, bank_account, bank_holder_name, reason } = body;

  if (!bank_name?.trim() || !bank_account?.trim() || !bank_holder_name?.trim()) {
    return NextResponse.json({ error: '银行名称、账号、持卡人姓名均为必填项' }, { status: 400 });
  }
  if (!reason?.trim()) {
    return NextResponse.json({ error: '修改原因为必填项（将记录在审计日志中）' }, { status: 400 });
  }

  const old = await pool.query(
    'SELECT bank_name, bank_account, bank_holder_name FROM users WHERE id = $1',
    [uid]
  );
  if (!old.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { rows } = await pool.query(
    `UPDATE users SET bank_name = $1, bank_account = $2, bank_holder_name = $3
     WHERE id = $4 RETURNING id, bank_name, bank_account, bank_holder_name`,
    [bank_name.trim(), bank_account.trim(), bank_holder_name.trim(), uid]
  );

  const ip = getClientIp(request);
  await logAudit({
    admin_id: payload.sub,
    action: 'MEMBER_BANK_EDIT',
    target_type: 'member',
    target_id: uid,
    old_value: old.rows[0] as Record<string, unknown>,
    new_value: {
      bank_name: bank_name.trim(),
      bank_account: bank_account.trim(),
      bank_holder_name: bank_holder_name.trim(),
      reason: reason.trim(),
      ip,
    },
  });

  return NextResponse.json(rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('member.bank.edit');
  if (!payload) return NextResponse.json({ error: 'Unauthorized — requires member.bank.edit permission' }, { status: 401 });

  const { id } = await params;
  const uid = parseInt(id, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const old = await pool.query(
    'SELECT bank_name, bank_account, bank_holder_name FROM users WHERE id = $1',
    [uid]
  );
  if (!old.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await pool.query(
    `UPDATE users SET bank_status = 'DELETED' WHERE id = $1`,
    [uid]
  );

  const ip = getClientIp(_req);
  await logAudit({
    admin_id: payload.sub,
    action: 'MEMBER_BANK_DELETE',
    target_type: 'member',
    target_id: uid,
    old_value: old.rows[0] as Record<string, unknown>,
    new_value: { bank_status: 'DELETED', ip },
  });

  return NextResponse.json({ ok: true });
}
