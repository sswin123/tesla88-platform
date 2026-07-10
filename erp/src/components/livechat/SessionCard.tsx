'use client';

import type { SupportSession } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TagBadge } from './TagBadge';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Waiting',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  OPEN: 'secondary',
  ACTIVE: 'default',
  CLOSED: 'destructive',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function Avatar({ name }: { name: string }) {
  const initials = name.trim().slice(0, 2).toUpperCase();
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      className={cn(
        'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white',
        color,
      )}
    >
      {initials}
    </div>
  );
}

export function SessionCard({
  session,
  isActive,
  onClick,
}: {
  session: SupportSession;
  isActive: boolean;
  onClick: () => void;
}) {
  const name = session.first_name ?? 'Unknown';
  const preview =
    session.last_message_content?.slice(0, 60) ?? `[${session.last_message_type ?? 'Media'}]`;
  const isMuted = Boolean(session.muted_until && new Date(session.muted_until) > new Date());

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-gray-50',
        isActive && 'bg-blue-50 border-l-2 border-blue-500',
      )}
    >
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-sm">
            {isMuted && <span title="Customer muted">🔇 </span>}
            {name}
          </span>
          <span className="flex-shrink-0 text-xs text-gray-400">
            {timeAgo(session.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="truncate text-xs text-gray-500">
            {session.guest_id
              ? session.guest_id
              : session.public_id
                ? session.public_id
                : session.telegram_username
                  ? `@${session.telegram_username}`
                  : `UID ${session.user_id}`}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {session.source === 'telegram' && (
              <span className="text-xs text-blue-400" title="Telegram">✈</span>
            )}
            {(session.source === 'website' || session.source === 'website_guest') && (
              <span className="text-xs text-green-500" title="Website">🌐</span>
            )}
            <Badge variant={STATUS_VARIANT[session.status]} className="text-xs px-1.5 py-0">
              {STATUS_LABEL[session.status]}
            </Badge>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className="truncate text-xs text-gray-400">{preview}</p>
          {session.erp_unread_count > 0 && (
            <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
              {session.erp_unread_count > 99 ? '99+' : session.erp_unread_count}
            </span>
          )}
        </div>
        {session.pinned_at && (
          <span className="text-xs text-blue-400">Pinned</span>
        )}
        {session.tags && session.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {session.tags.map((t) => (
              <TagBadge key={t.id} tag={t} />
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
