import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import { normalizeBankAccount } from '@/lib/bank';

export async function GET() {
  const payload = await requirePermission('settings.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query(
    'SELECT id, bank_name, account_number, note, created_at::text FROM registration_whitelist_banks ORDER BY created_at DESC'
  );
  return NextResponse.json({ banks: rows });
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('settings.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bank_name, account_number: rawAccount, note } = await req.json() as {
    bank_name?: string; account_number?: string; note?: string;
  };

  if (!bank_name?.trim() || !rawAccount?.trim())
    return NextResponse.json({ error: '银行名称和账号均为必填项' }, { status: 400 });

  const accountNumber = normalizeBankAccount(rawAccount);
  if (!accountNumber) return NextResponse.json({ error: '银行账号格式无效' }, { status: 400 });

  await pool.query(
    `INSERT INTO registration_whitelist_banks (bank_name, account_number, note)
     VALUES ($1, $2, $3)
     ON CONFLICT (bank_name, account_number) DO UPDATE SET note = EXCLUDED.note`,
    [bank_name.trim(), accountNumber, note?.trim() || null]
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const payload = await requirePermission('settings.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id?: number };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await pool.query('DELETE FROM registration_whitelist_banks WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
