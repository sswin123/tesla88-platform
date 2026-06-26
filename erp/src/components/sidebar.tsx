'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/',            label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/members',     label: 'Members',      icon: Users },
  { href: '/deposits',    label: 'Deposits',     icon: ArrowDownToLine },
  { href: '/withdrawals', label: 'Withdrawals',  icon: ArrowUpFromLine },
  { href: '/livechat',    label: 'Live Chat',    icon: MessageSquare },
  { href: '/banks',       label: 'Bank Manager', icon: Landmark },
  { href: '/promotions',  label: 'Promotions',   icon: Gift },
  { href: '/audit',       label: 'Audit Log',    icon: ScrollText },
  // Finance
  { href: '/finance',       label: 'Finance Reports', icon: BarChart2 },
  { href: '/analytics',     label: 'Member Analytics', icon: TrendingUp },
  // Operations
  { href: '/risk',          label: 'Risk Center',     icon: ShieldAlert },
  { href: '/providers',     label: 'Providers',       icon: Gamepad2 },
  { href: '/accounts',      label: 'Game Accounts',   icon: Database },
  { href: '/announcements', label: 'Announcements',   icon: Megaphone },
  // System
  { href: '/admin-users',   label: 'Admin Users',     icon: UserCog },
  { href: '/settings',      label: 'Settings',        icon: Settings },
  { href: '/maintenance',   label: 'Maintenance',     icon: Wrench },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

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

      <nav className="flex-1 space-y-1 p-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-gray-100 font-medium text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-2">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
