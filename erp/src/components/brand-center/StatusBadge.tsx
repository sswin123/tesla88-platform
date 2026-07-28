interface StatusBadgeProps {
  isActive: boolean;
}

export function StatusBadge({ isActive }: StatusBadgeProps) {
  return (
    <span
      className={
        `text-xs font-medium px-2 py-0.5 rounded-full ` +
        (isActive
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400')
      }
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}
