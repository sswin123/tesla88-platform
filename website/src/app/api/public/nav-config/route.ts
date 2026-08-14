import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const res = await pool.query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'nav_config'"
    );
    const raw = res.rows[0]?.value;
    if (!raw) return NextResponse.json({ items: [] });
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ items: [] });
  }
}
