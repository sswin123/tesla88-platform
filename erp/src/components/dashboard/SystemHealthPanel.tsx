'use client';

import { Server } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthService {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency?: number;
  detail?: string;
  icon?: LucideIcon;
}

interface SystemHealthPanelProps {
  services: HealthService[];
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  operational: {
    dot:   'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    label: 'Operational',
  },
  degraded: {
    dot:   'bg-amber-500 animate-pulse',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    label: 'Degraded',
  },
  down: {
    dot:   'bg-red-500 animate-pulse',
    badge: 'bg-red-500/10 text-red-600 dark:text-red-400',
    label: 'Down',
  },
} as const;

// ── Latency color ─────────────────────────────────────────────────────────────

function latencyClass(ms: number): string {
  if (ms < 100) return 'text-emerald-500';
  if (ms < 300) return 'text-amber-500';
  return 'text-red-500';
}

// ── Summary computation ───────────────────────────────────────────────────────

function computeSummary(services: HealthService[]) {
  const hasDown     = services.some((s) => s.status === 'down');
  const hasDegraded = services.some((s) => s.status === 'degraded');

  if (hasDown)     return { dot: 'bg-red-500 animate-pulse',    text: 'text-red-500',     label: 'System Outage Detected' };
  if (hasDegraded) return { dot: 'bg-amber-500 animate-pulse',  text: 'text-amber-500',   label: 'Some Systems Degraded' };
  return           { dot: 'bg-emerald-500',                     text: 'text-emerald-500', label: 'All Systems Operational' };
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SystemHealthPanel({ services }: SystemHealthPanelProps) {
  // ── Empty state ────────────────────────────────────────────────────────────
  if (services.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          System Health
        </p>
        <p className="text-sm text-muted-foreground">No system health data available</p>
      </div>
    );
  }

  const summary = computeSummary(services);

  return (
    <div className="rounded-xl border bg-card p-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          System Health
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn('h-2 w-2 rounded-full shrink-0', summary.dot)} aria-hidden="true" />
          <span className={cn('text-xs font-semibold', summary.text)}>
            {summary.label}
          </span>
        </div>
      </div>

      {/* ── Service rows ────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        {services.map((service) => {
          const cfg  = STATUS_CONFIG[service.status];
          const Icon = service.icon ?? Server;

          return (
            <div
              key={service.name}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors"
            >
              {/* Status dot */}
              <span
                className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)}
                aria-label={cfg.label}
              />

              {/* Service icon */}
              <Icon
                size={13}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />

              {/* Service name */}
              <span className="min-w-0 flex-1 text-sm font-medium text-foreground truncate">
                {service.name}
              </span>

              {/* Detail (hidden on small screens) */}
              {service.detail && (
                <span className="hidden md:block text-xs text-muted-foreground truncate max-w-[140px] shrink-0">
                  {service.detail}
                </span>
              )}

              {/* Latency */}
              {service.latency !== undefined && (
                <span
                  className={cn(
                    'shrink-0 text-xs font-mono tabular-nums',
                    latencyClass(service.latency),
                  )}
                >
                  {service.latency}ms
                </span>
              )}

              {/* Status badge — always visible for accessibility */}
              <span
                className={cn(
                  'shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full',
                  cfg.badge,
                )}
              >
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
