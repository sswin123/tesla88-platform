'use client';

import { AreaChart, Area, ResponsiveContainer } from 'recharts';

interface MiniSparklineProps {
  data: number[];
  color: string;
  height?: number;
}

interface SparkPoint {
  value: number;
}

export function MiniSparkline({ data, color, height = 32 }: MiniSparklineProps) {
  if (data.length === 0) return null;

  const chartData: SparkPoint[] = data.map((value) => ({ value }));
  const gradientId = `spark-${color.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
