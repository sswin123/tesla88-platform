import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { logAudit } from '@/lib/repositories/audit_repo';
import { requirePermission } from '@/lib/require_permission';

function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('members.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const uid = parseInt(id, 10);

  const check = await pool.query('SELECT id, phone FROM users WHERE id = $1', [uid]);
  if (!check.rows[0]) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  const newPassword = generatePassword();
  const hash = await bcrypt.hash(newPassword, 10);

  await pool.query(
    'UPDATE users SET website_password_hash = $1 WHERE id = $2',
    [hash, uid]
  );

  await logAudit({
    admin_id: payload.sub,
    action: 'MEMBER_RESET_WEBSITE_PASSWORD',
    target_type: 'member',
    target_id: uid,
    new_value: { phone: check.rows[0].phone },
  });

  return NextResponse.json({ ok: true, new_password: newPassword });
}
