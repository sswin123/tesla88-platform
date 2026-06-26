'use client';

interface DataPoint {
  label: string;
  value: number;
  [key: string]: unknown;
}

export function BarChart({
  data,
  valueKey = 'value',
  color = '#3B82F6',
  height = 120,
  formatValue,
}: {
  data: DataPoint[];
  valueKey?: string;
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  if (!data.length) return <p className="text-xs text-gray-400">No data</p>;
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const fmt = formatValue ?? ((v: number) => v.toFixed(0));

  return (
    <div className="w-full" style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${data.length * 40} ${height}`} preserveAspectRatio="none">
        {data.map((d, i) => {
          const val = Number(d[valueKey]) || 0;
          const barHeight = (val / max) * (height - 24);
          const x = i * 40 + 4;
          const y = height - barHeight - 20;
          return (
            <g key={d.label}>
              <rect x={x} y={y} width={32} height={barHeight} fill={color} rx={2} opacity={0.85}>
                <title>{d.label}: {fmt(val)}</title>
              </rect>
              <text x={x + 16} y={height - 4} textAnchor="middle" fontSize={9} fill="#9CA3AF">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
