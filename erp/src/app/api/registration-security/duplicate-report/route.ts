import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export async function GET() {
  const payload = await requirePermission('settings.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [phones, banks, telegrams, emails] = await Promise.all([
    // Duplicate phones
    pool.query<{ phone: string; count: number; user_ids: number[]; names: string[] }>(
      `SELECT phone,
              COUNT(*)::int                        AS count,
              ARRAY_AGG(id ORDER BY id)            AS user_ids,
              ARRAY_AGG(first_name ORDER BY id)    AS names
       FROM users
       WHERE phone IS NOT NULL
       GROUP BY phone
       HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC, phone
       LIMIT 200`
    ),

    // Duplicate bank accounts
    pool.query<{ bank_account: string; bank_name: string; count: number; user_ids: number[]; names: string[] }>(
      `SELECT bank_account,
              MODE() WITHIN GROUP (ORDER BY bank_name) AS bank_name,
              COUNT(*)::int                            AS count,
              ARRAY_AGG(id ORDER BY id)                AS user_ids,
              ARRAY_AGG(first_name ORDER BY id)        AS names
       FROM users
       WHERE bank_account IS NOT NULL
       GROUP BY bank_account
       HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC, bank_account
       LIMIT 200`
    ),

    // Duplicate telegram IDs
    pool.query<{ telegram_id: bigint; count: number; user_ids: number[]; names: string[] }>(
      `SELECT telegram_id,
              COUNT(*)::int                         AS count,
              ARRAY_AGG(id ORDER BY id)             AS user_ids,
              ARRAY_AGG(first_name ORDER BY id)     AS names
       FROM users
       WHERE telegram_id IS NOT NULL
       GROUP BY telegram_id
       HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC
       LIMIT 200`
    ),

    // Duplicate emails
    pool.query<{ email: string; count: number; user_ids: number[]; names: string[] }>(
      `SELECT LOWER(email) AS email,
              COUNT(*)::int                         AS count,
              ARRAY_AGG(id ORDER BY id)             AS user_ids,
              ARRAY_AGG(first_name ORDER BY id)     AS names
       FROM users
       WHERE email IS NOT NULL AND email != ''
       GROUP BY LOWER(email)
       HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC
       LIMIT 200`
    ),
  ]);

  return NextResponse.json({
    phones:    phones.rows,
    banks:     banks.rows,
    telegrams: telegrams.rows,
    emails:    emails.rows,
    totals: {
      phones:    phones.rows.length,
      banks:     banks.rows.length,
      telegrams: telegrams.rows.length,
      emails:    emails.rows.length,
    },
  });
}
