'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTheme } from 'next-themes';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RevenueDataPoint {
  date: string;
  deposit: number;
  withdrawal: number;
  net?: number;
}

export interface RevenueChartProps {
  data: RevenueDataPoint[];
  period: '7D' | '30D' | '6M';
  loading?: boolean;
}

interface TooltipEntry {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: string | number;
}

// ── Data colors ───────────────────────────────────────────────────────────────

const C_DEPOSIT    = '#6366f1';  // indigo
const C_WITHDRAWAL = '#f59e0b';  // amber
const C_NET        = '#10b981';  // emerald

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtYAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

function fmtRM(value: number): string {
  return `RM ${value.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function RevenueTooltip({
  active,
  payload,
  label,
  isDark,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  isDark: boolean;
}) {
  if (!active || !payload?.length) return null;

  const bg      = isDark ? '#1a2035' : '#ffffff';
  const border  = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)';
  const heading = isDark ? '#94a3b8' : '#64748b';
  const text    = isDark ? '#f1f5f9'  : '#1e293b';

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 12,
        minWidth: 190,
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
      }}
    >
      <p style={{ color: heading, marginBottom: 8, fontWeight: 600, letterSpacing: '0.02em' }}>
        {label}
      </p>
      {payload.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 20,
            marginTop: 4,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: heading }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: item.color,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            {String(item.name ?? '')}
          </span>
          <span
            style={{
              fontWeight: 700,
              color: text,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmtRM(Number(item.value ?? 0))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RevenueChart({ data, period, loading = false }: RevenueChartProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Default dark while unmounted to match ERP's defaultTheme="dark"
  const isDark    = mounted ? resolvedTheme === 'dark' : true;
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tickColor = isDark ? '#475569' : '#94a3b8';
  const axisLine  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  // Tick density: 30D has 30 points — show every 5th; 7D and 6M show all
  const xInterval = period === '30D' ? 4 : 0;

  // Render Net series only when the data actually contains net values
  const hasNet = data.some((d) => typeof d.net === 'number');

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-lg bg-muted animate-pulse">
        <span className="text-xs text-muted-foreground">Loading chart…</span>
      </div>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (!data.length) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-border">
        <span className="text-sm text-muted-foreground">No revenue data available</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        {/* ── Gradient fills ─────────────────────────────────────────────── */}
        <defs>
          <linearGradient id="rev-deposit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C_DEPOSIT}    stopOpacity={0.2} />
            <stop offset="95%" stopColor={C_DEPOSIT}    stopOpacity={0} />
          </linearGradient>
          <linearGradient id="rev-withdrawal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C_WITHDRAWAL} stopOpacity={0.2} />
            <stop offset="95%" stopColor={C_WITHDRAWAL} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="rev-net" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C_NET}        stopOpacity={0.12} />
            <stop offset="95%" stopColor={C_NET}        stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />

        <XAxis
          dataKey="date"
          tick={{ fill: tickColor, fontSize: 10 }}
          axisLine={{ stroke: axisLine }}
          tickLine={false}
          interval={xInterval}
          dy={6}
        />

        <YAxis
          tickFormatter={fmtYAxis}
          tick={{ fill: tickColor, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickCount={5}
        />

        <Tooltip
          content={(props) => (
            <RevenueTooltip
              active={props.active}
              payload={(props.payload as unknown) as TooltipEntry[] | undefined}
              label={typeof props.label === 'string' ? props.label : String(props.label ?? '')}
              isDark={isDark}
            />
          )}
        />

        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: tickColor, paddingTop: 10 }}
        />

        {/* ── Deposits ───────────────────────────────────────────────────── */}
        <Area
          type="monotone"
          dataKey="deposit"
          name="Deposits"
          stroke={C_DEPOSIT}
          strokeWidth={2}
          fill="url(#rev-deposit)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0, fill: C_DEPOSIT }}
          isAnimationActive={false}
        />

        {/* ── Withdrawals ────────────────────────────────────────────────── */}
        <Area
          type="monotone"
          dataKey="withdrawal"
          name="Withdrawals"
          stroke={C_WITHDRAWAL}
          strokeWidth={2}
          fill="url(#rev-withdrawal)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0, fill: C_WITHDRAWAL }}
          isAnimationActive={false}
        />

        {/* ── Net (6M only, when data contains net values) ────────────────── */}
        {hasNet && (
          <Area
            type="monotone"
            dataKey="net"
            name="Net"
            stroke={C_NET}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            fill="url(#rev-net)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: C_NET }}
            isAnimationActive={false}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
