import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export interface LiveTxRow {
  id:       string;
  phone:    string;
  amount:   number;
  provider: string;
  ts:       number;
}

function maskPhone(phone: string | null): string {
  if (!phone) return '****';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return '****';
  return digits.slice(0, 4) + '*'.repeat(5) + digits.slice(-3);
}

function toRows(
  rows: Array<{ id: number; phone: string | null; amount: string; provider: string; created_at: Date }>,
  prefix: string,
): LiveTxRow[] {
  return rows.map(r => ({
    id:       `${prefix}${r.id}`,
    phone:    maskPhone(r.phone),
    amount:   parseFloat(r.amount),
    provider: r.provider,
    ts:       new Date(r.created_at).getTime(),
  }));
}

export async function GET() {
  try {
    const [depositRes, withdrawRes] = await Promise.all([
      pool.query<{ id: number; phone: string | null; amount: string; provider: string; created_at: Date }>(
        `SELECT dr.id,
                u.phone,
                dr.deposit_amount AS amount,
                dr.provider,
                COALESCE(dr.reviewed_at, dr.created_at) AS created_at
         FROM deposit_requests dr
         LEFT JOIN users u ON u.id = dr.user_id
         WHERE dr.status = 'APPROVED'
         ORDER BY COALESCE(dr.reviewed_at, dr.created_at) DESC
         LIMIT 20`
      ),
      pool.query<{ id: number; phone: string | null; amount: string; provider: string; created_at: Date }>(
        `SELECT wr.id,
                u.phone,
                wr.withdraw_amount AS amount,
                wr.provider,
                COALESCE(wr.reviewed_at, wr.created_at) AS created_at
         FROM withdrawal_requests wr
         LEFT JOIN users u ON u.id = wr.user_id
         WHERE wr.status = 'PAID'
         ORDER BY COALESCE(wr.reviewed_at, wr.created_at) DESC
         LIMIT 20`
      ),
    ]);

    return NextResponse.json(
      {
        deposits:    toRows(depositRes.rows,  'd'),
        withdrawals: toRows(withdrawRes.rows, 'w'),
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (err) {
    console.error('[live-transactions] error:', err);
    return NextResponse.json({ deposits: [], withdrawals: [] });
  }
}
