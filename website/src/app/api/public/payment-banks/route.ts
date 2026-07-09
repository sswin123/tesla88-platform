import { NextResponse } from 'next/server';
import pool from '@/lib/db';

interface PaymentBank {
  id: number;
  bank_name: string;
  account_number: string;
  account_name: string;
}

export async function GET() {
  try {
    const res = await pool.query<PaymentBank>(
      `SELECT id, bank_name, account_number, account_name
       FROM payment_banks
       WHERE is_active = TRUE
       ORDER BY display_order, id`
    );
    return NextResponse.json(res.rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
