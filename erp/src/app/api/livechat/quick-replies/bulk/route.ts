import { NextRequest, NextResponse } from 'next/server';
import {
  bulkSetCategory,
  bulkSetActive,
  bulkDeleteReplies,
  bulkArchiveReplies,
  restoreQuickReply,
  setQuickReplyPinned,
} from '@/lib/repositories/support_repo';
import { requirePermission } from '@/lib/require_permission';

type BulkAction = 'archive' | 'restore' | 'enable' | 'disable' | 'set_category' | 'pin' | 'unpin' | 'delete';

export async function POST(req: NextRequest) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    action?: BulkAction;
    ids?: number[];
    category_id?: number | null;
  };

  const { action, ids } = body;
  if (!action || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'action and ids required' }, { status: 400 });
  }

  const validIds = ids.filter(x => typeof x === 'number' && Number.isInteger(x));
  if (validIds.length === 0) {
    return NextResponse.json({ error: 'No valid ids' }, { status: 400 });
  }

  switch (action) {
    case 'archive':
      await bulkArchiveReplies(validIds, payload.username);
      break;
    case 'restore':
      await Promise.all(validIds.map(id => restoreQuickReply(id)));
      break;
    case 'enable':
      await bulkSetActive(validIds, true, payload.username);
      break;
    case 'disable':
      await bulkSetActive(validIds, false, payload.username);
      break;
    case 'set_category':
      await bulkSetCategory(validIds, body.category_id ?? null, payload.username);
      break;
    case 'pin':
      await Promise.all(validIds.map(id => setQuickReplyPinned(id, true)));
      break;
    case 'unpin':
      await Promise.all(validIds.map(id => setQuickReplyPinned(id, false)));
      break;
    case 'delete':
      await bulkDeleteReplies(validIds);
      break;
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, count: validIds.length });
}
