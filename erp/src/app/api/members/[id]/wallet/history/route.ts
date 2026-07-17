import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payload = await requirePermission('member.wallet.history');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const uid = parseInt(id, 10);
  if (isNaN(uid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const page  = Math.max(1, parseInt(sp.get('page')  ?? '1',  10));
  const limit = Math.min(50, Math.max(1, parseInt(sp.get('limit') ?? '20', 10)));
  const offset = (page - 1) * limit;

  const [dataRes, countRes] = await Promise.all([
    pool.query(
      `SELECT
         wt.id, wt.type, wt.direction, wt.amount,
         wt.balance_before, wt.balance_after,
         wt.gateway, wt.reference_number, wt.remark,
         wt.ip_address, wt.created_at,
         a.username AS operator_name,
         ml.file_path AS attachment_url
       FROM wallet_transactions wt
       LEFT JOIN admins        a  ON a.id  = wt.operator_admin_id
       LEFT JOIN media_library ml ON ml.id = wt.attachment_media_id
       WHERE wt.user_id = $1
       ORDER BY wt.created_at DESC
       LIMIT $2 OFFSET $3`,
      [uid, limit, offset],
    ),
    pool.query(
      'SELECT COUNT(*)::int AS total FROM wallet_transactions WHERE user_id = $1',
      [uid],
    ),
  ]);

  return NextResponse.json({
    data:  dataRes.rows,
    total: countRes.rows[0].total,
    page,
    limit,
  });
}
