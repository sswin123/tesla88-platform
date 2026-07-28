import { Lock } from 'lucide-react';
import Link from 'next/link';

interface PermissionDeniedProps {
  message?: string;
}

export function PermissionDenied({ message }: PermissionDeniedProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 mb-4">
        <Lock size={28} className="text-red-500" />
      </div>
      <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">Access Denied</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
        {message ?? 'You do not have permission to access this page. Contact your administrator.'}
      </p>
      <Link
        href="/"
        className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
