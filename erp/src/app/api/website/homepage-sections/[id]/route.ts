import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: '权限不足' }, { status: 401 });

  try {
    const { id } = await params;
    const { rows } = await pool.query('SELECT * FROM homepage_sections WHERE id = $1', [parseInt(id, 10)]);
    if (!rows[0]) return NextResponse.json({ error: '区块不存在' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error('[homepage-sections/[id] GET]', err);
    return NextResponse.json({ error: '数据库错误' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: '权限不足' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json() as Record<string, unknown>;

    const allowed = ['name', 'config', 'display_order', 'is_enabled', 'start_at', 'end_at'];
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const key of allowed) {
      if (key in body) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(key === 'config' ? JSON.stringify(body[key]) : body[key]);
      }
    }

    if (setClauses.length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });

    values.push(parseInt(id, 10));
    const { rows } = await pool.query(
      `UPDATE homepage_sections SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!rows[0]) return NextResponse.json({ error: '区块不存在' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error('[homepage-sections/[id] PATCH]', err);
    return NextResponse.json({ error: '数据库错误，无法保存变更' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: '权限不足' }, { status: 401 });

  try {
    const { id } = await params;
    const { rows } = await pool.query(
      'DELETE FROM homepage_sections WHERE id = $1 RETURNING id',
      [parseInt(id, 10)]
    );
    if (!rows[0]) return NextResponse.json({ error: '区块不存在' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[homepage-sections/[id] DELETE]', err);
    return NextResponse.json({ error: '数据库错误，无法删除区块' }, { status: 500 });
  }
}
