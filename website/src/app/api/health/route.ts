import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    await pool.query('SELECT 1');
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      { status: 'error', timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
