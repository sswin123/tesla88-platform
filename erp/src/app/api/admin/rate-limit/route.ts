import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { _resetRateLimitStore } from '@/lib/rate-limit';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function POST() {
  const payload = await requirePermission('security.ratelimit.clear');
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  _resetRateLimitStore();

  logAudit({
    admin_id:    payload.sub,
    action:      'RATE_LIMIT_CLEARED',
    target_type: 'system',
    target_id:   0,
    new_value:   { cleared_by: payload.username, cleared_at: new Date().toISOString() },
  }).catch(() => {});

  return NextResponse.json({ ok: true, message: 'All login rate limits have been cleared.' });
}
