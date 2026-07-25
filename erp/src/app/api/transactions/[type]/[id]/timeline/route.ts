import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getAuditLogsByTarget } from '@/lib/repositories/audit_repo';
import type { AuditLog } from '@/lib/types';

interface TimelineItem {
  id: number;
  event: string;
  description: string | null;
  adminName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await params;

  // Validate type
  if (type !== 'deposit' && type !== 'withdrawal') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  // Parse id as integer
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // Check permission
  const payload = await requirePermission('transaction.timeline.view');
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse page and pageSize from query params
  const searchParams = new URL(req.url).searchParams;
  const pageStr = searchParams.get('page');
  const pageSizeStr = searchParams.get('pageSize');

  let page = 1;
  if (pageStr !== null) {
    page = parseInt(pageStr, 10);
    if (isNaN(page)) {
      return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
    }
    if (page < 1) {
      page = 1;
    }
  }

  let pageSize = 20;
  if (pageSizeStr !== null) {
    pageSize = parseInt(pageSizeStr, 10);
    if (isNaN(pageSize)) {
      return NextResponse.json({ error: 'Invalid pageSize' }, { status: 400 });
    }
    if (pageSize > 100) {
      pageSize = 100;
    }
  }

  // Fetch audit logs
  const result = await getAuditLogsByTarget({
    target_type: type,
    target_id: numId,
    page,
    pageSize,
  });

  // Map AuditLog to TimelineItem
  const items: TimelineItem[] = result.data.map((log: AuditLog) => ({
    id: log.id,
    event: log.action,
    description: log.description ?? null,
    adminName: log.admin_username ?? null,
    metadata: log.new_value ?? null,
    createdAt: log.created_at,
  }));

  return NextResponse.json({
    items,
    total: result.total,
    page,
    pageSize,
  });
}
