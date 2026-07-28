// erp/src/components/staff/StatusBadge.tsx
import { Badge } from '@/components/ui/badge';

const STATUS_CONFIG: Record<string, { emoji: string; label: string; className: string }> = {
  ONLINE:       { emoji: '🟢', label: 'Online',       className: 'border-green-200 bg-green-50 text-green-700' },
  IDLE:         { emoji: '🟡', label: 'Idle',         className: 'border-yellow-200 bg-yellow-50 text-yellow-700' },
  BREAK:        { emoji: '🔵', label: 'Break',        className: 'border-blue-200 bg-blue-50 text-blue-700' },
  OFFLINE:      { emoji: '🔴', label: 'Offline',      className: 'border-red-200 bg-red-50 text-red-700' },
  DISCONNECTED: { emoji: '⚫', label: 'Disconnected', className: 'border-gray-300 bg-gray-100 text-gray-600' },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.OFFLINE;
  return (
    <Badge variant="outline" className={cfg.className}>
      <span className="mr-1">{cfg.emoji}</span>{cfg.label}
    </Badge>
  );
}
