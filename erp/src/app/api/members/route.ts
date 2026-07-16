import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';
import bcrypt from 'bcryptjs';
import { normalizePhone } from '@/lib/phone';

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

  const body = await req.json() as {
    first_name?: string;
    phone?: string;
    password?: string;
    telegram_username?: string;
    referral_code?: string;
    vip_level?: number;
    status?: string;
  };

  const firstName = (body.first_name ?? '').trim();
  const phone = (body.phone ?? '').trim();
  const password = (body.password ?? '').trim();
  const telegramUsername = (body.telegram_username ?? '').trim() || null;
  const referralCode = (body.referral_code ?? '').trim() || null;
  const vipLevel = Number(body.vip_level ?? 0);
  const status = ['ACTIVE', 'FROZEN'].includes(body.status ?? '') ? body.status! : 'ACTIVE';

  if (!firstName || !phone || !password)
    return NextResponse.json({ error: 'first_name, phone and password required' }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ error: '密码至少需要6个字符' }, { status: 400 });

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone)
    return NextResponse.json({ error: '手机号格式无效，请输入马来西亚手机号（如 011-12345678）' }, { status: 400 });

  // Check phone uniqueness with normalized format
  const existing = await pool.query<{ id: number }>(
    'SELECT id FROM users WHERE phone = $1 LIMIT 1', [normalizedPhone]
  );
  if (existing.rows.length > 0)
    return NextResponse.json({ error: '该手机号已存在' }, { status: 409 });

  const hash = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Resolve referral code
    let referredById: number | null = null;
    if (referralCode) {
      const refRow = await client.query<{ id: number }>(
        `SELECT id FROM users WHERE referral_code = $1 LIMIT 1`, [referralCode]
      );
      referredById = refRow.rows[0]?.id ?? null;
    }

    const memberRow = await client.query<{ id: number }>(
      `INSERT INTO users
         (first_name, phone, telegram_username, website_password_hash, website_registered_at,
          eligible_free_credit, referred_by, status, vip_level, register_source)
       VALUES ($1, $2, $3, $4, NOW(), FALSE, $5, $6, $7, 'ERP')
       RETURNING id`,
      [firstName, normalizedPhone, telegramUsername, hash, referredById, status, vipLevel]
    );
    const userId = memberRow.rows[0].id;

    // Fetch brand prefix
    const brandRow = await client.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'member_id_prefix' LIMIT 1`
    );
    const prefix = brandRow.rows[0]?.value ?? 'SS';
    const publicId = `${prefix}${1000000 + userId}`;

    await client.query(
      `UPDATE users SET public_id = $1, referral_code = $1 WHERE id = $2`,
      [publicId, userId]
    );

    if (referredById) {
      await client.query(
        `UPDATE users SET referral_count = referral_count + 1 WHERE id = $1`, [referredById]
      );
    }

    await client.query('COMMIT');
    return NextResponse.json({ ok: true, id: userId, public_id: publicId }, { status: 201 });
  } catch (err) {
    await client.query('ROLLBACK');
    const pgErr = err as Record<string, unknown>;
    if (pgErr.code === '23505') {
      const detail = String(pgErr.detail ?? '');
      if (detail.includes('phone')) return NextResponse.json({ error: '该手机号已存在' }, { status: 409 });
      if (detail.includes('telegram')) return NextResponse.json({ error: '该 Telegram 账号已绑定其他会员' }, { status: 409 });
      return NextResponse.json({ error: `唯一键冲突：${detail || '请检查重复数据'}` }, { status: 409 });
    }
    if (pgErr.code === '42703')
      return NextResponse.json({ error: `数据库字段不存在，请检查 Migration 是否已全部执行（列：${pgErr.message}）` }, { status: 500 });
    if (pgErr.code === '23502')
      return NextResponse.json({ error: `必填字段为空：${pgErr.message}` }, { status: 500 });
    console.error('[members POST]', err);
    return NextResponse.json({ error: String(pgErr.message ?? '创建失败，请稍后重试') }, { status: 500 });
  } finally {
    client.release();
  }
}
