'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  Landmark,
  Gift,
  ScrollText,
  MessageSquare,
  LogOut,
  BarChart2,
  TrendingUp,
  ShieldAlert,
  Gamepad2,
  Database,
  Megaphone,
  UserCog,
  Settings,
  Wrench,
  Bot,
  Images,
  Zap,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem  = { href: string; label: string; icon: React.ElementType; exact?: boolean };
type NavGroup = { title?: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: '/',            label: 'Dashboard',   icon: LayoutDashboard, exact: true },
      { href: '/members',     label: 'Members',     icon: Users },
      { href: '/deposits',    label: 'Deposits',    icon: ArrowDownToLine },
      { href: '/withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine },
      { href: '/livechat',    label: 'Live Chat',   icon: MessageSquare },
      { href: '/livechat/quick-replies', label: 'Quick Replies', icon: Zap },
    ],
  },
  {
    items: [
      { href: '/banks',         label: 'Bank Manager',  icon: Landmark },
      { href: '/promotions',    label: 'Promotions',    icon: Gift },
      { href: '/announcements', label: 'Announcements', icon: Megaphone },
      { href: '/broadcast',     label: 'Broadcast',     icon: Radio },
      { href: '/audit',         label: 'Audit Log',     icon: ScrollText },
    ],
  },
  {
    items: [
      { href: '/finance',   label: 'Finance Reports',  icon: BarChart2 },
      { href: '/analytics', label: 'Member Analytics', icon: TrendingUp },
      { href: '/risk',      label: 'Risk Center',      icon: ShieldAlert },
      { href: '/providers', label: 'Providers',        icon: Gamepad2 },
      { href: '/accounts',  label: 'Game Accounts',    icon: Database },
    ],
  },
  {
    title: 'Control Center',
    items: [
      { href: '/settings/bot',    label: 'Telegram Bot',  icon: Bot },
      { href: '/media-library',   label: 'Media Library', icon: Images },
    ],
  },
  {
    items: [
      { href: '/admin-users', label: 'Admin Users', icon: UserCog },
      { href: '/settings',    label: 'Settings',    icon: Settings, exact: true },
      { href: '/maintenance', label: 'Maintenance', icon: Wrench },
    ],
  },
];

function isActive(href: string, pathname: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [maintenanceOn, setMaintenanceOn] = useState(false);

  useEffect(() => {
    fetch('/api/maintenance/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { maintenance_mode: boolean } | null) => {
        if (d?.maintenance_mode) setMaintenanceOn(true);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-white">
      <div className="border-b px-4 py-4">
        <span className="text-base font-semibold tracking-tight">ERP Admin</span>
      </div>

      {maintenanceOn && (
        <div className="mx-2 mt-2 rounded-md bg-red-50 border border-red-300 px-3 py-2 text-xs text-red-700 font-medium">
          Maintenance mode is ON
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="mx-1 my-2 border-t border-gray-100" />}
            {group.title && (
              <p className="mx-3 mb-1 mt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {group.title}
              </p>
            )}
            {group.items.map(({ href, label, icon: Icon, exact }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive(href, pathname, exact)
                    ? 'bg-gray-100 font-medium text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t p-2">
        <button
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
