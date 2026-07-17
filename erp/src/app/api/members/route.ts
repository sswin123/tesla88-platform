import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { registerUser } from '@/lib/services/RegistrationService';
import pool from '@/lib/db';

function maskPhone(phone: string): string {
  if (!phone) return phone;
  if (phone.length <= 6) return '*'.repeat(phone.length);
  return phone.slice(0, 4) + '*'.repeat(phone.length - 6) + phone.slice(-2);
}

export async function GET(request: NextRequest) {
  const payload = await requirePermission('members.view');
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const canViewPhone = !!(await requirePermission('member.view_phone'));
  const { searchParams } = request.nextUrl;
  const search = searchParams.get('search')?.trim() ?? '';
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit  = 20;
  const offset = (page - 1) * limit;

  if (search) {
    const pattern = `%${search}%`;
    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT id, public_id, telegram_id, telegram_username, first_name, phone, status, created_at
         FROM users
         WHERE public_id ILIKE $1 OR id::text ILIKE $1 OR phone ILIKE $1 OR first_name ILIKE $1 OR telegram_username ILIKE $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [pattern, limit, offset]
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM users
         WHERE public_id ILIKE $1 OR id::text ILIKE $1 OR phone ILIKE $1 OR first_name ILIKE $1 OR telegram_username ILIKE $1`,
        [pattern]
      ),
    ]);
    const data = canViewPhone ? rows.rows : rows.rows.map((r) => ({ ...r, phone: maskPhone(r.phone as string) }));
    return NextResponse.json({ data, total: count.rows[0].count, page, limit });
  }

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT id, public_id, telegram_id, telegram_username, first_name, phone, status, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users'),
  ]);
  const data = canViewPhone ? rows.rows : rows.rows.map((r) => ({ ...r, phone: maskPhone(r.phone as string) }));
  return NextResponse.json({ data, total: count.rows[0].count, page, limit });
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('members.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isSuperAdmin = payload.role === 'SUPER_ADMIN';

  const body = await req.json() as {
    first_name?: string;
    phone?: string;
    password?: string;
    telegram_username?: string;
    referral_code?: string;
    vip_level?: number;
    status?: string;
    ignore_duplicate?: boolean;
  };

  // Only Super Admin can bypass duplicate check
  const ignoreDuplicate = isSuperAdmin && body.ignore_duplicate === true;

  const result = await registerUser({
    first_name:         body.first_name        ?? '',
    raw_phone:          body.phone             ?? '',
    raw_password:       body.password          ?? '',
    min_password_length: 6,
    telegram_username:  body.telegram_username,
    referral_code:      body.referral_code,
    vip_level:          Number(body.vip_level  ?? 0),
    status:             (['ACTIVE','FROZEN'].includes(body.status ?? '') ? body.status : 'ACTIVE') as 'ACTIVE' | 'FROZEN',
    register_source:    'ERP',
    allow_upgrade:      false,      // ERP creates new members only
    ignore_duplicate:   ignoreDuplicate,
    admin_id:           payload.sub,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.http_status });
  }

  return NextResponse.json({ ok: true, id: result.user_id, public_id: result.public_id }, { status: 201 });
}
