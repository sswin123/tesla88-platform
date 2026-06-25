'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { SupportSession } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  OPEN: 'secondary',
  ACTIVE: 'default',
  CLOSED: 'destructive',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Waiting',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
};

export function SessionActions({
  session,
  onUpdate,
}: {
  session: SupportSession;
  onUpdate: (updated: SupportSession) => void;
}) {
  const [acting, setActing] = useState(false);

  async function doAction(action: string) {
    if (acting) return;
    if (action === 'close' && !confirm('Close this conversation?')) return;
    setActing(true);
    const r = await fetch(`/api/livechat/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && (d as { session?: SupportSession }).session) {
      onUpdate((d as { session: SupportSession }).session);
    } else {
      alert((d as { error?: string }).error ?? 'Action failed');
    }
    setActing(false);
  }

  const isPinned = Boolean(session.pinned_at);

  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b bg-white px-4 py-2">
      <Badge variant={STATUS_VARIANT[session.status] ?? 'secondary'}>
        {STATUS_LABEL[session.status] ?? session.status}
      </Badge>

      {session.assigned_to_username && (
        <span className="text-xs text-gray-400">
          Assigned: @{session.assigned_to_username}
        </span>
      )}

      <div className="ml-auto flex gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={acting}
          onClick={() => doAction('assign')}
        >
          Assign to me
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={acting}
          onClick={() => doAction(isPinned ? 'unpin' : 'pin')}
        >
          {isPinned ? '📌 Unpin' : '📌 Pin'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={acting}
          onClick={() => doAction('mark_unread')}
        >
          Mark Unread
        </Button>
        {session.status !== 'CLOSED' ? (
          <Button
            size="sm"
            variant="destructive"
            disabled={acting}
            onClick={() => doAction('close')}
          >
            Close
          </Button>
        ) : (
          <Button size="sm" disabled={acting} onClick={() => doAction('reopen')}>
            Reopen
          </Button>
        )}
      </div>
    </div>
  );
}
