import { PROVIDER_STATUS } from './constants';

interface ProviderStatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  [PROVIDER_STATUS.ACTIVE]:      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  [PROVIDER_STATUS.DISABLED]:    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  [PROVIDER_STATUS.MAINTENANCE]: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  [PROVIDER_STATUS.TESTING]:     'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

export function ProviderStatusBadge({ status }: ProviderStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  const label = status.charAt(0) + status.slice(1).toLowerCase();

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style}`}>
      {label}
    </span>
  );
}
