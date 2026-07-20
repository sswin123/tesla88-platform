import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { parseHeaderConfig } from '@/lib/header-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await pool.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'header_config'`
    );
    const raw = res.rows[0]?.value;
    if (!raw) return NextResponse.json(null);
    const config = parseHeaderConfig(raw);
    return NextResponse.json(config, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(null);
  }
}
