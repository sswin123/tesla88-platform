import { NextRequest, NextResponse } from 'next/server';
import { getAudienceCount } from '@/lib/repositories/broadcast_repo';
import type { BroadcastAudienceType } from '@/lib/types';
import { requirePermission } from '@/lib/require_permission';

const VALID_AUDIENCE_TYPES = new Set([
  'ALL','TAG','VIP','ACTIVE','INACTIVE','NEVER_DEPOSIT','DEPOSITED','SELECTED',
]);

export async function GET(req: NextRequest) {
  const payload = await requirePermission('broadcast.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp   = req.nextUrl.searchParams;
  const type = (sp.get('type') ?? 'ALL').toUpperCase();
  if (!VALID_AUDIENCE_TYPES.has(type))
    return NextResponse.json({ error: 'invalid type' }, { status: 400 });

  const tagId   = sp.get('tag_id') ? parseInt(sp.get('tag_id')!, 10) : null;
  const userIds = sp.get('user_ids')
    ? sp.get('user_ids')!.split(',').map(Number).filter(n => !isNaN(n))
    : null;

  const count = await getAudienceCount(type as BroadcastAudienceType, { tagId, userIds });
  return NextResponse.json({ count });
}
