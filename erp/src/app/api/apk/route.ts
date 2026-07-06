import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  await requireAdmin(req);
  const res = await pool.query(
    `SELECT id, version_name, version_code, release_notes, media_id, min_android,
            is_current, force_update, download_count, created_by, created_at
     FROM apk_versions ORDER BY created_at DESC`
  );
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  const body = await req.json() as {
    version_name?: string; version_code?: number; release_notes?: string;
    media_id?: number | null; min_android?: string; is_current?: boolean; force_update?: boolean;
  };
  if (!body.version_name) return NextResponse.json({ error: 'version_name required' }, { status: 400 });
  if (!body.version_code) return NextResponse.json({ error: 'version_code required' }, { status: 400 });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    if (body.is_current) {
      await client.query('UPDATE apk_versions SET is_current = FALSE WHERE is_current = TRUE');
    }
    const res = await client.query(
      `INSERT INTO apk_versions (version_name, version_code, release_notes, media_id, min_android, is_current, force_update, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [body.version_name, body.version_code, body.release_notes ?? null, body.media_id ?? null,
       body.min_android ?? '6.0', body.is_current ?? false, body.force_update ?? false, admin.username]
    );
    await client.query('COMMIT');
    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (e) {
    await client?.query('ROLLBACK');
    throw e;
  } finally {
    client?.release();
  }
}
