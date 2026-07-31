import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  console.log('[health] handler entered');
  try {
    const result = {
      pool: {
        total:   pool.totalCount,
        idle:    pool.idleCount,
        waiting: pool.waitingCount,
      },
      ts: new Date().toISOString(),
    };
    console.log('[health] returning response:', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err) {
    console.error('[health] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
