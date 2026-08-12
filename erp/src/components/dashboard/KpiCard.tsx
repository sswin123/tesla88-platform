'use client';

import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MiniSparkline } from './MiniSparkline';

interface KpiTrend {
  value: number;
  label?: string;
  positive?: boolean;
}

export interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: KpiTrend;
  sparklineData?: number[];
  sparklineColor?: string;
  iconClassName?: string;
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  sparklineData,
  sparklineColor = '#6366f1',
  iconClassName,
  className,
}: KpiCardProps) {
  const isPositive =
    trend !== undefined
      ? trend.positive !== undefined
        ? trend.positive
        : trend.value >= 0
      : true;

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-card p-4 overflow-hidden',
        'transition-all duration-200',
        'hover:shadow-md hover:border-muted-foreground/30',
        className,
      )}
    >
      {/* Header: icon + label */}
      <div className="flex items-center gap-2.5 mb-4">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            'bg-muted text-muted-foreground',
            iconClassName,
          )}
          aria-hidden="true"
        >
          <Icon size={15} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground leading-none">
          {title}
        </p>
      </div>

      {/* Main value */}
      <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums leading-none">
        {value}
      </p>

      {/* Subtitle */}
      {subtitle && (
        <p className="mt-1.5 text-xs text-muted-foreground leading-snug">
          {subtitle}
        </p>
      )}

      {/* Trend indicator */}
      {trend !== undefined && (
        <div className="mt-2 flex items-center gap-1.5">
          {isPositive ? (
            <TrendingUp
              size={12}
              className="shrink-0 text-emerald-500"
              aria-hidden="true"
            />
          ) : (
            <TrendingDown
              size={12}
              className="shrink-0 text-red-500"
              aria-hidden="true"
            />
          )}
          <span
            className={cn(
              'text-xs font-semibold',
              isPositive ? 'text-emerald-500' : 'text-red-500',
            )}
          >
            {isPositive && trend.value > 0 ? '+' : ''}
            {trend.value.toFixed(1)}%
          </span>
          {trend.label && (
            <span className="text-xs text-muted-foreground">{trend.label}</span>
          )}
        </div>
      )}

      {/* Sparkline — rendered last, flush to card edges */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="mt-3 -mx-1">
          <MiniSparkline
            data={sparklineData}
            color={sparklineColor}
            height={32}
          />
        </div>
      )}
    </div>
  );
}
