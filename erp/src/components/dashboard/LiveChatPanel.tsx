'use client';

import { Globe, MessageCircle, Inbox, Clock, Users, MessageSquare, Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiveChatConversation {
  id: string;
  customerName: string;
  preview: string;
  timestamp: string;
  unread?: number;
  status?: 'online' | 'offline' | 'waiting';
  source?: 'website' | 'telegram';
}

export interface LiveChatAggregate {
  open: number;
  waiting: number;
  todaySessions: number;
  avgResponseSec: number;
  onlineStaff: number;
  csPerformance?: { agent: string; sessions: number }[];
}

export interface LiveChatPanelProps {
  conversations: LiveChatConversation[];
  totalUnread?: number;
  aggregate?: LiveChatAggregate;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_DOT = {
  online:  'bg-emerald-500',
  waiting: 'bg-amber-500 animate-pulse',
  offline: 'bg-muted-foreground/30',
} as const;

const STATUS_LABEL = {
  online:  'Online',
  waiting: 'Waiting for reply',
  offline: 'Offline',
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
  if (s < 60)   return `${Math.round(s)}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

function initials(name: string): string {
  return name.charAt(0).toUpperCase();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      'flex flex-col rounded-lg px-3 py-2.5 gap-0.5',
      highlight ? 'bg-amber-500/10' : 'bg-muted/60',
    )}>
      <div className="flex items-center gap-1.5">
        <Icon size={11} className={cn('shrink-0', highlight ? 'text-amber-500' : 'text-muted-foreground')} aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>
      <span className={cn(
        'text-lg font-bold tabular-nums leading-none',
        highlight ? 'text-amber-500' : 'text-foreground',
      )}>
        {value}
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function LiveChatPanel({ conversations, totalUnread = 0, aggregate }: LiveChatPanelProps) {
  const hasConversations = conversations.length > 0;

  return (
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col h-full">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Live Chat Operations
        </p>
        {totalUnread > 0 ? (
          <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
            {totalUnread} Waiting
          </span>
        ) : (
          <span className="text-[10px] font-medium text-emerald-500">All caught up</span>
        )}
      </div>

      {/* ── Aggregate stats grid ─────────────────────────────────────────── */}
      {aggregate && (
        <div className="grid grid-cols-2 gap-2 p-4 border-b border-border sm:grid-cols-4">
          <StatChip
            icon={MessageSquare}
            label="Open"
            value={aggregate.open}
            highlight={aggregate.open > 0}
          />
          <StatChip
            icon={Clock}
            label="Waiting"
            value={aggregate.waiting}
            highlight={aggregate.waiting > 0}
          />
          <StatChip
            icon={Headphones}
            label="Today"
            value={aggregate.todaySessions}
          />
          <StatChip
            icon={Users}
            label="Staff"
            value={aggregate.onlineStaff}
          />
        </div>
      )}

      {/* ── Avg response time ────────────────────────────────────────────── */}
      {aggregate && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
          <span className="text-xs text-muted-foreground">Avg. Response Time (today)</span>
          <span className="text-xs font-semibold text-foreground tabular-nums">
            {fmtSeconds(aggregate.avgResponseSec)}
          </span>
        </div>
      )}

      {/* ── CS Performance ───────────────────────────────────────────────── */}
      {aggregate?.csPerformance && aggregate.csPerformance.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            CS Performance — Today
          </p>
          <div className="space-y-1.5">
            {aggregate.csPerformance.slice(0, 5).map((cs, i) => {
              const maxSessions = aggregate.csPerformance![0].sessions;
              const pct = maxSessions > 0 ? (cs.sessions / maxSessions) * 100 : 0;
              return (
                <div key={cs.agent} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-3 shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-xs text-foreground truncate min-w-0 w-24 shrink-0">
                    {cs.agent}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold tabular-nums text-muted-foreground shrink-0">
                    {cs.sessions}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Conversation list ────────────────────────────────────────────── */}
      {!hasConversations ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 flex-1">
          <Inbox size={22} className="text-muted-foreground/30" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">No active conversations</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-y-auto flex-1" aria-label="Active conversations">
          {conversations.map((conv) => {
            const status    = conv.status ?? 'offline';
            const dotClass  = STATUS_DOT[status];
            const dotLabel  = STATUS_LABEL[status];
            const SourceIcon = conv.source === 'website' ? Globe : MessageCircle;

            return (
              <li
                key={conv.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                {/* Avatar + status dot */}
                <div className="relative shrink-0">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                    {initials(conv.customerName)}
                  </div>
                  <span
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card',
                      dotClass,
                    )}
                    aria-label={dotLabel}
                  />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {conv.customerName}
                    </span>
                    <SourceIcon
                      size={10}
                      className={cn(
                        'shrink-0',
                        conv.source === 'telegram'
                          ? 'text-blue-400'
                          : 'text-muted-foreground/40',
                      )}
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conv.preview}
                  </p>
                </div>

                {/* Timestamp + unread */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {conv.timestamp}
                  </span>
                  {conv.unread && conv.unread > 0 ? (
                    <span className="h-4 min-w-[1rem] px-1 text-[10px] font-bold rounded-full bg-indigo-500 text-white flex items-center justify-center">
                      {conv.unread > 9 ? '9+' : conv.unread}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
