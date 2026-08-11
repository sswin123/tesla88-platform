'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Bell, User } from 'lucide-react';
import { useSidebarState } from '@/components/mobile/sidebar-context';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

interface Props {
  onOpenDrawer: () => void;
  isDrawerOpen: boolean;
}

export function MobileHeader({ onOpenDrawer, isDrawerOpen }: Props) {
  const { brand, livechatUnread, pendingCount } = useSidebarState();
  const pathname = usePathname();
  const totalBadge = livechatUnread + pendingCount;

  return (
    <header className="sticky top-0 z-30 flex h-14 flex-shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4 lg:hidden">
      <button
        onClick={onOpenDrawer}
        className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:bg-muted transition-colors"
        aria-label="Open navigation menu"
        aria-expanded={isDrawerOpen}
        aria-controls="mobile-sidebar-drawer"
      >
        <Menu size={22} />
      </button>

      <span className="flex-1 truncate text-sm font-semibold text-foreground">
        {brand.brand_name} ERP
      </span>

      <div className="flex items-center gap-1">
        <ThemeToggle />

        <Link
          href="/transactions"
          className="relative flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:bg-muted transition-colors"
          aria-label={`Notifications${totalBadge > 0 ? ` — ${totalBadge} pending` : ''}`}
        >
          <Bell size={20} />
          {totalBadge > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
              {totalBadge > 99 ? '99+' : totalBadge}
            </span>
          )}
        </Link>

        <Link
          href="/settings/profile"
          className={`flex h-10 w-10 items-center justify-center rounded-md hover:bg-muted active:bg-muted transition-colors ${
            pathname === '/settings/profile' ? 'text-primary' : 'text-muted-foreground'
          }`}
          aria-label="Profile settings"
        >
          <User size={20} />
        </Link>
      </div>
    </header>
  );
}
