'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { SidebarContent } from '@/components/sidebar';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileSidebarDrawer({ isOpen, onClose }: Props) {
  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll while drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        id="mobile-sidebar-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed left-0 top-0 z-50 flex h-full w-72 max-w-[85vw] flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-in-out lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer header with close button */}
        <div className="flex items-center justify-end border-b border-border px-4 py-3">
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:bg-muted"
            aria-label="Close navigation menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <SidebarContent onNavigate={onClose} />
        </div>
      </div>
    </>
  );
}
