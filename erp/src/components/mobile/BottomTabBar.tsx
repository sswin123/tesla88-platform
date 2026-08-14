'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, MessageSquare, CreditCard, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarState } from '@/components/mobile/sidebar-context';
import { isActive } from '@/components/sidebar-nav';

interface Props {
  onOpenDrawer: () => void;
}

const TABS = [
  { href: '/',             label: 'Home',         icon: LayoutDashboard, exact: true },
  { href: '/members',      label: 'Members',      icon: Users,           exact: false },
  { href: '/livechat',     label: 'Chat',         icon: MessageSquare,   exact: false },
  { href: '/transactions', label: 'Transactions', icon: CreditCard,      exact: false },
] as const;

export function BottomTabBar({ onOpenDrawer }: Props) {
  const { livechatUnread, pendingCount } = useSidebarState();
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-stretch border-t border-border bg-background lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Tab navigation"
    >
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(href, pathname, exact);
        const badge = href === '/livechat' ? livechatUnread
                    : href === '/transactions' ? pendingCount
                    : 0;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
              active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <div className="relative">
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              {badge > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span>{label}</span>
          </Link>
        );
      })}

      {/* More button opens the full sidebar drawer */}
      <button
        onClick={onOpenDrawer}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        aria-label="More options"
        aria-haspopup="dialog"
      >
        <MoreHorizontal size={22} strokeWidth={2} />
        <span>More</span>
      </button>
    </nav>
  );
}
