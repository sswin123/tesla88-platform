import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export interface PublicPaymentBank {
  id: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  qr_media_id: string | null;   // qr_image (base64) aliased; null when not set
  instructions: string | null;   // null when column not yet in schema
}

function isMissingColumnError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as Record<string, unknown>).code === '42703';
}

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider');

  // Three-tier fallback for payment_banks schema evolution:
  //   Tier 1 (post-028): maintenance_mode + provider_binding + priority present
  //   Tier 2 (post-027): maintenance_mode present, no provider_binding/priority
  //   Tier 3 (base):     only is_active; no maintenance_mode
  //
  // qr_media_id and instructions are NOT real columns — always aliased or nulled.

  const queries: Array<{ sql: string; params: unknown[] }> = provider
    ? [
        {
          // Tier 1 (post-028): filter by maintenance_mode + provider_binding, order by priority
          sql: `SELECT id, bank_name, account_number, account_name,
                       qr_image AS qr_media_id, NULL::text AS instructions
                FROM payment_banks
                WHERE is_active = TRUE AND maintenance_mode = FALSE
                  AND (provider_binding IS NULL OR provider_binding = $1)
                ORDER BY priority DESC, display_order ASC, id ASC`,
          params: [provider],
        },
        {
          // Tier 2 (post-027): maintenance_mode exists but no provider_binding
          sql: `SELECT id, bank_name, account_number, account_name,
                       qr_image AS qr_media_id, NULL::text AS instructions
                FROM payment_banks
                WHERE is_active = TRUE AND maintenance_mode = FALSE
                ORDER BY display_order ASC, id ASC`,
          params: [],
        },
        {
          // Tier 3 (base schema): no maintenance_mode column
          sql: `SELECT id, bank_name, account_number, account_name,
                       qr_image AS qr_media_id, NULL::text AS instructions
                FROM payment_banks
                WHERE is_active = TRUE
                ORDER BY display_order ASC, id ASC`,
          params: [],
        },
      ]
    : [
        {
          // Tier 1 (post-028)
          sql: `SELECT id, bank_name, account_number, account_name,
                       qr_image AS qr_media_id, NULL::text AS instructions
                FROM payment_banks
                WHERE is_active = TRUE AND maintenance_mode = FALSE
                ORDER BY priority DESC, display_order ASC, id ASC`,
          params: [],
        },
        {
          // Tier 2 (post-027)
          sql: `SELECT id, bank_name, account_number, account_name,
                       qr_image AS qr_media_id, NULL::text AS instructions
                FROM payment_banks
                WHERE is_active = TRUE AND maintenance_mode = FALSE
                ORDER BY display_order ASC, id ASC`,
          params: [],
        },
        {
          // Tier 3 (base)
          sql: `SELECT id, bank_name, account_number, account_name,
                       qr_image AS qr_media_id, NULL::text AS instructions
                FROM payment_banks
                WHERE is_active = TRUE
                ORDER BY display_order ASC, id ASC`,
          params: [],
        },
      ];

  for (const { sql, params } of queries) {
    try {
      const res = await pool.query<PublicPaymentBank>(sql, params);
      return NextResponse.json(res.rows);
    } catch (err) {
      if (isMissingColumnError(err)) {
        console.warn('[public/payment-banks] migration pending, trying next fallback');
        continue;
      }
      console.error('[public/payment-banks] query error:', err);
      return NextResponse.json([], { status: 200 });
    }
  }

  return NextResponse.json([]);
}
