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
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground uppercase tracking-wider">
            {open ? '▼' : '▶'}
          </span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
          {comingSoon && (
            <span className="text-xs text-muted-foreground italic">— coming soon</span>
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
