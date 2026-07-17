import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import { normalizePhone } from '@/lib/phone';

export async function GET() {
  const payload = await requirePermission('settings.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query(
    'SELECT id, phone, note, created_at::text FROM registration_whitelist_phones ORDER BY created_at DESC'
  );
  return NextResponse.json({ phones: rows });
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('settings.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { phone: rawPhone, note } = await req.json() as { phone?: string; note?: string };
  const phone = normalizePhone(rawPhone ?? '');
  if (!phone) return NextResponse.json({ error: '手机号格式无效，请输入马来西亚号码' }, { status: 400 });

  await pool.query(
    `INSERT INTO registration_whitelist_phones (phone, note)
     VALUES ($1, $2)
     ON CONFLICT (phone) DO UPDATE SET note = EXCLUDED.note`,
    [phone, note?.trim() || null]
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const payload = await requirePermission('settings.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id?: number };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await pool.query('DELETE FROM registration_whitelist_phones WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
