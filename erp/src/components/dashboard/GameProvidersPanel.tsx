'use client';

import { Gamepad2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GameProviderStatus {
  code: string;
  name: string;
  status: 'operational' | 'degraded' | 'down' | 'maintenance';
  latency?: number;
  games?: number;
  activePlayers?: number;
  todayTurnover?: number;
  lastSync?: string;
  icon?: LucideIcon;
}

interface GameProvidersPanelProps {
  providers: GameProviderStatus[];
}

// ── Status config ─────────────────────────────────────────────────────────────

type ProviderStatus = GameProviderStatus['status'];

const STATUS_CONFIG: Record<ProviderStatus, {
  dot: string;
  badge: string;
  label: string;
  order: number;
}> = {
  operational: {
    dot:   'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    label: 'Operational',
    order: 3,
  },
  degraded: {
    dot:   'bg-amber-500 animate-pulse',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    label: 'Degraded',
    order: 1,
  },
  down: {
    dot:   'bg-red-500 animate-pulse',
    badge: 'bg-red-500/10 text-red-600 dark:text-red-400',
    label: 'Down',
    order: 0,
  },
  maintenance: {
    dot:   'bg-blue-500',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    label: 'Maintenance',
    order: 2,
  },
};

// ── Summary computation ───────────────────────────────────────────────────────

function computeSummary(providers: GameProviderStatus[]) {
  const hasDown        = providers.some((p) => p.status === 'down');
  const hasDegraded    = providers.some((p) => p.status === 'degraded');
  const hasMaintenance = providers.some((p) => p.status === 'maintenance');

  if (hasDown)        return { dot: 'bg-red-500 animate-pulse',   text: 'text-red-500',     label: 'Provider Outage Detected' };
  if (hasDegraded)    return { dot: 'bg-amber-500 animate-pulse', text: 'text-amber-500',   label: 'Provider Issues Detected' };
  if (hasMaintenance) return { dot: 'bg-blue-500',                text: 'text-blue-400',    label: 'Maintenance In Progress' };
  return               { dot: 'bg-emerald-500',                   text: 'text-emerald-500', label: 'All Providers Operational' };
}

// ── Latency color ─────────────────────────────────────────────────────────────

function latencyClass(ms: number): string {
  if (ms < 100) return 'text-muted-foreground';
  if (ms < 300) return 'text-amber-500';
  return 'text-red-500';
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtRM(value: number): string {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `RM ${(value / 1_000).toFixed(0)}K`;
  return `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0 })}`;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 6;

// ── Main Component ────────────────────────────────────────────────────────────

export function GameProvidersPanel({ providers }: GameProvidersPanelProps) {
  // ── Empty state ────────────────────────────────────────────────────────────
  if (providers.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Game Providers
        </p>
        <p className="text-sm text-muted-foreground">No game providers configured</p>
      </div>
    );
  }

  // Sort: problems first (down → degraded → maintenance → operational)
  const sorted = [...providers].sort(
    (a, b) => STATUS_CONFIG[a.status].order - STATUS_CONFIG[b.status].order,
  );

  const displayed   = sorted.slice(0, MAX_VISIBLE);
  const hiddenCount = sorted.length - MAX_VISIBLE;

  const onlineCount = providers.filter((p) => p.status === 'operational').length;
  const summary     = computeSummary(providers);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Game Providers
        </p>

        <div className="flex items-center gap-3">
          {/* Online count */}
          <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
            {onlineCount} / {providers.length}{' '}
            <span className="text-emerald-500">ONLINE</span>
          </span>
          {/* Summary pill */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn('h-2 w-2 rounded-full shrink-0', summary.dot)} aria-hidden="true" />
            <span className={cn('text-[10px] font-semibold', summary.text)}>
              {summary.label}
            </span>
          </div>
        </div>
      </div>

      {/* ── Provider rows ────────────────────────────────────────────────── */}
      <ul className="divide-y divide-border" aria-label="Game provider status">
        {displayed.map((provider) => {
          const cfg  = STATUS_CONFIG[provider.status];
          const Icon = provider.icon ?? Gamepad2;

          return (
            <li
              key={provider.code}
              className="px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              {/* ── Row 1: identity + status + latency ───────────────── */}
              <div className="flex items-center gap-2.5">
                {/* Status dot */}
                <span
                  className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)}
                  aria-label={cfg.label}
                />

                {/* Icon */}
                <Icon
                  size={14}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />

                {/* Provider name */}
                <span className="min-w-0 flex-1 text-sm font-semibold text-foreground truncate">
                  {provider.name}
                </span>

                {/* Status badge */}
                <span
                  className={cn(
                    'shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full',
                    cfg.badge,
                  )}
                >
                  {cfg.label}
                </span>

                {/* Latency */}
                {provider.latency !== undefined && (
                  <span
                    className={cn(
                      'shrink-0 text-xs font-mono tabular-nums',
                      latencyClass(provider.latency),
                    )}
                  >
                    {provider.latency}ms
                  </span>
                )}
              </div>

              {/* ── Row 2: secondary metrics (hidden on mobile) ───────── */}
              {(provider.games !== undefined ||
                provider.activePlayers !== undefined ||
                provider.todayTurnover !== undefined ||
                provider.lastSync) && (
                <div className="hidden sm:flex items-center gap-3 mt-1.5 ml-[calc(0.5rem+14px+0.625rem)]">
                  {provider.games !== undefined && (
                    <span className="text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground tabular-nums">
                        {provider.games.toLocaleString('en-MY')}
                      </span>{' '}
                      Games
                    </span>
                  )}
                  {provider.activePlayers !== undefined && (
                    <span className="text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground tabular-nums">
                        {provider.activePlayers.toLocaleString('en-MY')}
                      </span>{' '}
                      Players
                    </span>
                  )}
                  {provider.todayTurnover !== undefined && (
                    <span className="text-[10px] text-muted-foreground">
                      Today{' '}
                      <span className="font-medium text-foreground tabular-nums">
                        {fmtRM(provider.todayTurnover)}
                      </span>
                    </span>
                  )}
                  {provider.lastSync && (
                    <span className="text-[10px] text-muted-foreground">
                      Synced{' '}
                      <span className="font-medium">{provider.lastSync}</span>
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* ── Overflow footer ──────────────────────────────────────────────── */}
      {hiddenCount > 0 && (
        <div className="px-4 py-2.5 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground">
            +{hiddenCount} more provider{hiddenCount !== 1 ? 's' : ''} not shown
          </p>
        </div>
      )}
    </div>
  );
}
