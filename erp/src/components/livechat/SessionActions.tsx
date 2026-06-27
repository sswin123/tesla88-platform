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
  onNewSession,
  currentUsername,
  currentRole,
}: {
  session: SupportSession;
  onUpdate: (updated: SupportSession) => void;
  onNewSession?: (newSession: SupportSession) => void;
  currentUsername: string | null;
  currentRole: string | null;
}) {
  const [acting, setActing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferring, setTransferring] = useState(false);

  async function doAction(action: string) {
    if (acting) return;
    if (action === 'close' && !confirm('Close this conversation?')) return;
    if (action === 'new_session' && !confirm('Start a new conversation for this customer? The current conversation will remain intact.')) return;
    setActing(true);
    const r = await fetch(`/api/livechat/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && (d as { session?: SupportSession }).session) {
      if ((d as { is_new_session?: boolean }).is_new_session) {
        onNewSession?.((d as { session: SupportSession }).session);
      } else {
        onUpdate((d as { session: SupportSession }).session);
      }
    } else {
      alert((d as { error?: string }).error ?? 'Action failed');
    }
    setActing(false);
  }

  function handleCopyTelegramId() {
    if (!session.telegram_id) return;
    navigator.clipboard.writeText(session.telegram_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      fetch('/api/livechat/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'LIVECHAT_TELEGRAM_ID_COPIED', session_id: session.id }),
      }).catch(() => {});
    }).catch(() => {});
  }

  async function handleTransfer() {
    const target = transferTarget.trim();
    if (!target || transferring) return;
    setTransferring(true);
    const r = await fetch(`/api/livechat/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assign', username: target }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && (d as { session?: SupportSession }).session) {
      onUpdate((d as { session: SupportSession }).session);
      setShowTransfer(false);
      setTransferTarget('');
    } else {
      alert((d as { error?: string }).error ?? 'Transfer failed');
    }
    setTransferring(false);
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
        {/* Copy Telegram ID */}
        {session.telegram_id && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyTelegramId}
            title="Copy Telegram ID"
          >
            {copied ? '✓ Copied' : '📋 ID'}
          </Button>
        )}

        {/* Transfer — SUPER_ADMIN only */}
        {currentRole === 'SUPER_ADMIN' && session.status !== 'CLOSED' && (
          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              disabled={acting || transferring}
              onClick={() => setShowTransfer((v) => !v)}
            >
              Transfer
            </Button>
            {showTransfer && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowTransfer(false)}
                />
                <div className="absolute right-0 top-9 z-20 w-56 rounded-lg border bg-white shadow-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-600">Transfer to agent</p>
                  <input
                    className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="agent_username"
                    value={transferTarget}
                    onChange={(e) => setTransferTarget(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleTransfer(); }}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={transferring || !transferTarget.trim()}
                    onClick={handleTransfer}
                  >
                    {transferring ? 'Transferring…' : 'Confirm Transfer'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

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
          <>
            <Button size="sm" disabled={acting} onClick={() => doAction('reopen')}>
              Reopen
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => doAction('new_session')}
              title="Start a fresh conversation for this customer"
            >
              New Session
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
