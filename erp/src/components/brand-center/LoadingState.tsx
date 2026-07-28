import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 size={28} className="animate-spin text-slate-400" />
      {message && (
        <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
      )}
    </div>
  );
}
