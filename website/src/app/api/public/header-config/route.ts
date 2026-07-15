import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await pool.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'header_config'`
    );
    const raw = res.rows[0]?.value;
    if (!raw) return NextResponse.json(null);
    return NextResponse.json(JSON.parse(raw), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(null);
  }
}
