'use client';

import { useState } from 'react';

interface WorkspaceSectionProps {
  title: string;
  defaultOpen?: boolean;
  badge?: string;
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
  comingSoon?: boolean;
}

export default function WorkspaceSection({
  title,
  defaultOpen = true,
  badge,
  headerActions,
  children,
  comingSoon = false,
}: WorkspaceSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            {open ? '▼' : '▶'}
          </span>
          <span className="text-sm font-semibold text-gray-700">{title}</span>
          {badge && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
          {comingSoon && (
            <span className="text-xs text-gray-400 italic">— coming soon</span>
          )}
        </div>
        {headerActions && !comingSoon && (
          <div
            className="flex items-center gap-2"
            onClick={e => e.stopPropagation()}
          >
            {headerActions}
          </div>
        )}
      </button>

      {/* Content */}
      {open && !comingSoon && (
        <div className="border-t px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}
