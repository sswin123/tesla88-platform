import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export interface PublicPaymentBank {
  id: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  qr_media_id: number | null;
  instructions: string | null;
}

export async function GET() {
  try {
    const res = await pool.query<PublicPaymentBank>(
      `SELECT id, bank_name, account_number, account_name, qr_media_id, instructions
       FROM payment_banks
       WHERE is_active = TRUE
       ORDER BY display_order ASC, id ASC`
    );
    return NextResponse.json(res.rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
