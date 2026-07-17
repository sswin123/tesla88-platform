import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { BANK_COOKIE_NAME, COOKIE_MAXAGE } from '@/lib/auth';
import { normalizeBankAccount } from '@/lib/bank';

// Called by /complete-bank-information page to verify bank status and hydrate cookie
export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const res = await pool.query<{ bank_account: string | null }>(
    'SELECT bank_account FROM users WHERE id = $1',
    [member.sub]
  );
  const bankAccount = res.rows[0]?.bank_account ?? null;
  const bankComplete = !!bankAccount;

  const response = NextResponse.json({ bank_complete: bankComplete });
  if (bankComplete) {
    // Set cookie so middleware allows access
    response.cookies.set(BANK_COOKIE_NAME, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAXAGE,
      path: '/',
      sameSite: 'lax',
    });
  }
  return response;
}

const MY_BANK_LIST = [
  'Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank',
  'AmBank', 'Bank Islam', 'Bank Rakyat', 'BSN', 'OCBC Bank', 'UOB Bank',
  'HSBC Bank', 'Standard Chartered', 'Alliance Bank', 'Affin Bank', 'Agrobank',
  'MBSB Bank', 'Bank Muamalat', 'Al Rajhi Bank', 'Citibank', 'GXBank',
  'Boost Bank', 'AEON Bank', "Touch 'n Go eWallet", 'ShopeePay', 'BigPay',
  'Other',
];

const ACCOUNT_MIN = 6;
const ACCOUNT_MAX = 20;

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    bank_name?: string;
    bank_account?: string;
    bank_holder_name?: string;
  };
  const bank_name        = (body.bank_name ?? '').trim();
  const bank_account     = normalizeBankAccount(body.bank_account ?? '');
  const bank_holder_name = (body.bank_holder_name ?? '').trim();

  // Validate all required fields
  if (!bank_name || !bank_account || !bank_holder_name) {
    return NextResponse.json({ error: '所有字段均为必填项' }, { status: 400 });
  }

  // Bank name must be from approved list
  if (!MY_BANK_LIST.includes(bank_name)) {
    return NextResponse.json({ error: '请从下拉列表中选择银行名称' }, { status: 400 });
  }

  // Account number: digits only
  if (!/^\d+$/.test(bank_account)) {
    return NextResponse.json({ error: '银行账号只能包含数字，不能含有字母或空格' }, { status: 400 });
  }
  if (bank_account.length < ACCOUNT_MIN) {
    return NextResponse.json({ error: `银行账号最少 ${ACCOUNT_MIN} 位数字` }, { status: 400 });
  }
  if (bank_account.length > ACCOUNT_MAX) {
    return NextResponse.json({ error: `银行账号最多 ${ACCOUNT_MAX} 位数字` }, { status: 400 });
  }

  // Check if this member already has bank bound (locked)
  const existing = await pool.query<{ bank_account: string | null }>(
    'SELECT bank_account FROM users WHERE id = $1',
    [member.sub]
  );
  if (existing.rows[0]?.bank_account) {
    return NextResponse.json({ error: '银行信息已绑定，不可自行修改，请联系客服' }, { status: 409 });
  }

  // Check for duplicate bank account across active members
  const duplicate = await pool.query<{ id: number }>(
    `SELECT id FROM users WHERE bank_account = $1 AND id != $2 AND status = 'ACTIVE' LIMIT 1`,
    [bank_account, member.sub]
  );
  if (duplicate.rows.length > 0) {
    return NextResponse.json({ error: '该银行账号已被其他会员使用，请核实后重新填写' }, { status: 409 });
  }

  // Atomic write: only update if bank_account is still NULL (prevents race condition)
  const { rows } = await pool.query(
    `UPDATE users
     SET bank_name = $1, bank_account = $2, bank_holder_name = $3, bank_locked_at = NOW()
     WHERE id = $4 AND bank_account IS NULL
     RETURNING id`,
    [bank_name, bank_account, bank_holder_name, member.sub]
  );

  if (!rows[0]) {
    return NextResponse.json({ error: '银行信息已绑定，不可自行修改，请联系客服' }, { status: 409 });
  }

  // Set bank_ok cookie so middleware allows access
  const response = NextResponse.json({ ok: true });
  response.cookies.set(BANK_COOKIE_NAME, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAXAGE,
    path: '/',
    sameSite: 'lax',
  });
  return response;
}
