import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getAllBanks, createBank } from '@/lib/repositories/bank_repo';

export async function GET() {
  const banks = await getAllBanks();
  return NextResponse.json(banks);
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    bank_name?: string;
    account_number?: string;
    account_name?: string;
    qr_image?: string | null;
    display_order?: number;
    maintenance_mode?: boolean;
    maintenance_message?: string | null;
    provider_binding?: string | null;
    priority?: number;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.bank_name || !body.account_number || !body.account_name) {
    return NextResponse.json(
      { error: 'bank_name, account_number, account_name are required' },
      { status: 400 }
    );
  }

  try {
    const bank = await createBank({
      bank_name:           body.bank_name,
      account_number:      body.account_number,
      account_name:        body.account_name,
      qr_image:            body.qr_image ?? null,
      display_order:       body.display_order ?? 0,
      maintenance_mode:    body.maintenance_mode ?? false,
      maintenance_message: body.maintenance_message ?? null,
      provider_binding:    body.provider_binding ?? null,
      priority:            body.priority ?? 0,
    });
    return NextResponse.json(bank, { status: 201 });
  } catch (err) {
    const pgErr = err as Record<string, unknown>;
    console.error('[POST /api/banks] createBank failed:', pgErr);

    if (pgErr.code === '23505') {
      const detail = String(pgErr.detail ?? '');
      if (detail.includes('bank_name'))      return NextResponse.json({ error: '银行名称已存在，请使用不同的名称' }, { status: 409 });
      if (detail.includes('account_number')) return NextResponse.json({ error: '该账号已存在' }, { status: 409 });
      return NextResponse.json({ error: '数据重复，请检查银行名称或账号' }, { status: 409 });
    }
    if (pgErr.code === '23502') {
      return NextResponse.json({ error: `必填字段缺失：${pgErr.column ?? '未知字段'}` }, { status: 400 });
    }
    if (pgErr.code === '42703') {
      return NextResponse.json(
        { error: '数据库迁移未完成（Migration 027/028 required），请联系管理员' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: String(pgErr.message ?? '保存失败，请稍后重试') }, { status: 500 });
  }
}
