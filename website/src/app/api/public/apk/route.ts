import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { ApkVersion } from '@/lib/types';

export async function GET() {
  const res = await pool.query<ApkVersion>(
    `SELECT id, version_name, version_code, release_notes, min_android,
            is_current, force_update, download_count, created_at
     FROM apk_versions WHERE is_current = TRUE LIMIT 1`
  );
  return NextResponse.json(res.rows[0] ?? null);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { id?: number };
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await pool.query(
    'UPDATE apk_versions SET download_count = download_count + 1 WHERE id = $1',
    [body.id]
  );
  return NextResponse.json({ ok: true });
}
