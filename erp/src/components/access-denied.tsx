'use client';

import { Lock } from 'lucide-react';

export function AccessDenied() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Lock size={40} className="text-gray-300" />
      <h2 className="text-base font-semibold text-gray-700">Access Denied</h2>
      <p className="text-sm text-gray-400">
        You do not have permission to view this page.
      </p>
    </div>
  );
}
