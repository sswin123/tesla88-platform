import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

/**
 * GET /api/games/settings/[code]/audit
 * Returns paginated audit log entries for a provider.
 *
 * Query params:
 *   page        (default 1)
 *   limit       (default 50)
 *   action      filter by action type
 *   from/to     date range
 *   export_csv  if '1', returns CSV
 */
export async function GET(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const sp = req.nextUrl.searchParams;

  const page      = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  const limit     = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));
  const offset    = (page - 1) * limit;
  const action    = sp.get('action') ?? null;
  const from      = sp.get('from') ?? null;
  const to        = sp.get('to') ?? null;
  const exportCsv = sp.get('export_csv') === '1';

  const { rows: provRows } = await pool.query(
    `SELECT id FROM gp_providers WHERE code = $1 LIMIT 1`, [code.toUpperCase()],
  );
  if (!provRows[0]) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const providerId = provRows[0].id;

  const conditions: string[] = [`provider_id = $1`];
  const args: (string | number)[] = [providerId];
  let i = 2;

  if (action) { conditions.push(`action = $${i++}`); args.push(action); }
  if (from)   { conditions.push(`created_at >= $${i++}`); args.push(from); }
  if (to)     { conditions.push(`created_at <= $${i++}`); args.push(to); }

  const WHERE = conditions.join(' AND ');

  if (exportCsv) {
    const { rows } = await pool.query(
      `SELECT id, action, field_key, old_value_hint, new_value_hint,
              admin_username, ip_address, notes, created_at
       FROM gp_config_audit_log WHERE ${WHERE} ORDER BY created_at DESC LIMIT 5000`,
      args,
    );
    const header = 'id,action,field_key,old_value,new_value,admin,ip,notes,created_at\n';
    const lines = rows.map(r =>
      [r.id, r.action, r.field_key ?? '', r.old_value_hint ?? '', r.new_value_hint ?? '',
       r.admin_username ?? '', r.ip_address ?? '', (r.notes ?? '').replace(/"/g,'""'), r.created_at]
        .map(v => `"${v}"`).join(',')
    );
    return new NextResponse(header + lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit_log_${code}_${Date.now()}.csv"`,
      },
    });
  }

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT id, action, field_key, old_value_hint, new_value_hint,
              admin_username, ip_address, notes, created_at
       FROM gp_config_audit_log WHERE ${WHERE} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i+1}`,
      [...args, limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM gp_config_audit_log WHERE ${WHERE}`, args),
  ]);

  return NextResponse.json({
    rows,
    total: countRows[0]?.total ?? 0,
    page,
    limit,
    pages: Math.ceil((countRows[0]?.total ?? 0) / limit),
  });
}
