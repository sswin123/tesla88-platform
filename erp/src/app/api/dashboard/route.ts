import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { DashboardStats } from '@/lib/types';

export async function GET() {
  const client = await pool.connect();
  try {
    const [tm, am, td, tw, pd, pw] = await Promise.all([
      client.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM users'
      ),
      client.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM users WHERE status = 'ACTIVE'"
      ),
      client.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM deposit_requests WHERE status = 'APPROVED'"
      ),
      client.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM withdrawal_requests WHERE status = 'PAID'"
      ),
      client.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM deposit_requests WHERE status = 'PENDING'"
      ),
      client.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM withdrawal_requests WHERE status = 'PENDING'"
      ),
    ]);

    const stats: DashboardStats = {
      totalMembers:       tm.rows[0].count,
      activeMembers:      am.rows[0].count,
      totalDeposits:      td.rows[0].count,
      totalWithdrawals:   tw.rows[0].count,
      pendingDeposits:    pd.rows[0].count,
      pendingWithdrawals: pw.rows[0].count,
    };

    return NextResponse.json(stats);
  } finally {
    client.release();
  }
}
