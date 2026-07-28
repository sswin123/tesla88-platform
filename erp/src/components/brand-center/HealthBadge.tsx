import { CheckCircle, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import { HEALTH_STATUS } from './constants';

interface HealthBadgeProps {
  status: string;
}

const HEALTH_CFG: Record<string, { color: string; icon: typeof CheckCircle; label: string }> = {
  [HEALTH_STATUS.HEALTHY]:  { color: 'text-emerald-500', icon: CheckCircle,   label: 'Healthy' },
  [HEALTH_STATUS.DEGRADED]: { color: 'text-amber-500',   icon: AlertTriangle, label: 'Degraded' },
  [HEALTH_STATUS.DOWN]:     { color: 'text-rose-500',    icon: XCircle,       label: 'Down' },
  [HEALTH_STATUS.UNKNOWN]:  { color: 'text-slate-400',   icon: HelpCircle,    label: 'Unknown' },
};

export function HealthBadge({ status }: HealthBadgeProps) {
  const cfg = HEALTH_CFG[status] ?? HEALTH_CFG[HEALTH_STATUS.UNKNOWN];
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      <Icon size={16} />
      {cfg.label}
    </span>
  );
}
