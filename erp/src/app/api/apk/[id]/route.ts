import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  await requireAdmin(req);
  const { id } = await ctx.params;
  const body = await req.json() as { is_current?: boolean; force_update?: boolean; release_notes?: string };

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    if (body.is_current === true) {
      await client.query('UPDATE apk_versions SET is_current = FALSE WHERE is_current = TRUE AND id != $1', [id]);
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (body.is_current    !== undefined) { sets.push(`is_current = $${i++}`);    vals.push(body.is_current); }
    if (body.force_update  !== undefined) { sets.push(`force_update = $${i++}`);  vals.push(body.force_update); }
    if (body.release_notes !== undefined) { sets.push(`release_notes = $${i++}`); vals.push(body.release_notes); }
    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    vals.push(id);
    const res = await client.query(
      `UPDATE apk_versions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    await client.query('COMMIT');
    if (res.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(res.rows[0]);
  } catch (e) {
    await client?.query('ROLLBACK');
    throw e;
  } finally {
    client?.release();
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  await requireAdmin(req);
  const { id } = await ctx.params;
  const check = await pool.query('SELECT id, is_current FROM apk_versions WHERE id = $1', [id]);
  if (check.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (check.rows[0].is_current) return NextResponse.json({ error: 'Cannot delete current version. Set another version as current first.' }, { status: 409 });
  await pool.query('DELETE FROM apk_versions WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
