'use client';

import { Users } from 'lucide-react';
import { MiniSparkline } from './MiniSparkline';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemberStats {
  total: number;
  newToday: number;
  activeToday: number;
  active?: number;
  vip?: number;
  online?: number;
}

export interface MemberPanelProps {
  stats: MemberStats;
  sparklineData?: number[];
  sparklineLabel?: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={
          accent
            ? 'text-sm font-bold tabular-nums text-emerald-500'
            : 'text-sm font-semibold tabular-nums text-foreground'
        }
      >
        {value.toLocaleString('en-MY')}
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function MemberPanel({ stats, sparklineData, sparklineLabel }: MemberPanelProps) {
  return (
    <div className="rounded-xl border bg-card p-4 h-full">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <Users size={14} className="text-muted-foreground shrink-0" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Member Overview
        </p>
      </div>

      {/* ── Hero: Total Members ──────────────────────────────────────────── */}
      <div className="mb-4">
        <p
          className="text-3xl font-bold tabular-nums text-foreground leading-none"
          aria-label={`Total members: ${stats.total.toLocaleString('en-MY')}`}
        >
          {stats.total.toLocaleString('en-MY')}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Total Members</p>
        {stats.newToday > 0 && (
          <p className="text-xs font-medium text-emerald-500 mt-0.5">
            +{stats.newToday.toLocaleString('en-MY')} registered today
          </p>
        )}
      </div>

      {/* ── Compact stats list ───────────────────────────────────────────── */}
      <div>
        <StatRow label="New Today"    value={stats.newToday}    accent />
        <StatRow label="Active Today" value={stats.activeToday} />
        {stats.active  !== undefined && <StatRow label="Active Members" value={stats.active} />}
        {stats.vip     !== undefined && <StatRow label="VIP Members"    value={stats.vip} />}
        {stats.online  !== undefined && <StatRow label="Online Now"     value={stats.online} />}
      </div>

      {/* ── Sparkline ────────────────────────────────────────────────────── */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            {sparklineLabel ?? 'Trend (7D)'}
          </p>
          <MiniSparkline data={sparklineData} color="#10b981" height={36} />
        </div>
      )}
    </div>
  );
}
