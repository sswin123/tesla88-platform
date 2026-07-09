'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
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
  ShieldCheck,
  Bot,
  Images,
  Zap,
  Radio,
  Globe,
  Smartphone,
  FileText,
  Building2,
  Image,
  Bell,
  Joystick,
  CreditCard,
  Activity,
  HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem  = { href: string; label: string; icon: React.ElementType; exact?: boolean; permission?: string };
type NavGroup = { title?: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: '/',            label: 'Dashboard',   icon: LayoutDashboard, exact: true, permission: 'dashboard.view' },
      { href: '/members',     label: 'Members',     icon: Users,           permission: 'members.view' },
      { href: '/deposits',    label: 'Deposits',    icon: ArrowDownToLine, permission: 'deposit.view' },
      { href: '/withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine, permission: 'withdraw.view' },
      { href: '/livechat',    label: 'Live Chat',   icon: MessageSquare,   permission: 'livechat.view' },
      { href: '/livechat/quick-replies', label: 'Quick Replies', icon: Zap, permission: 'livechat.view' },
    ],
  },
  {
    items: [
      { href: '/banks',         label: 'Bank Manager',  icon: Landmark, permission: 'banks.manage' },
      { href: '/promotions',    label: 'Promotions',    icon: Gift,     permission: 'promotions.manage' },
      { href: '/announcements', label: 'Announcements', icon: Megaphone,permission: 'announcements.manage' },
      { href: '/broadcast',     label: 'Broadcast',     icon: Radio,    permission: 'broadcast.manage' },
      { href: '/audit',         label: 'Audit Log',     icon: ScrollText,permission: 'audit.view' },
    ],
  },
  {
    items: [
      { href: '/finance',   label: 'Finance Reports',  icon: BarChart2,   permission: 'finance.view' },
      { href: '/analytics', label: 'Member Analytics', icon: TrendingUp,  permission: 'analytics.view' },
      { href: '/risk',      label: 'Risk Center',      icon: ShieldAlert, permission: 'risk.view' },
      { href: '/providers', label: 'Providers',        icon: Gamepad2,    permission: 'game.manage' },
      { href: '/accounts',  label: 'Game Accounts',    icon: Database,    permission: 'game.manage' },
    ],
  },
  {
    title: 'Control Center',
    items: [
      { href: '/settings/brand',        label: 'Brand Center',  icon: Building2, permission: 'brand.settings' },
      { href: '/settings/bot',          label: 'Telegram Bot',  icon: Bot,       permission: 'bot.settings' },
      { href: '/settings/bot/messages', label: 'Bot Messages',  icon: FileText,  permission: 'bot.messages' },
      { href: '/media-library',         label: 'Media Library', icon: Images,    permission: 'media.view' },
    ],
  },
  {
    title: 'Website',
    items: [
      { href: '/website-settings', label: 'Website Settings', icon: Globe,       permission: 'website.settings' },
      { href: '/apk-manager',      label: 'APK Manager',      icon: Smartphone,  permission: 'website.settings' },
      { href: '/website-banners',        label: 'Banners',       icon: Image, permission: 'website.banner.manage' },
      { href: '/website-announcements', label: 'Announcements',    icon: Bell,     permission: 'website.announcement.manage' },
      { href: '/website-game-providers',  label: 'Game Providers', icon: Joystick,   permission: 'website.game.manage' },
      { href: '/website-payment-banks',   label: 'Payment Banks',  icon: CreditCard, permission: 'payment.bank.manage' },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/system/health',  label: '健康监控', icon: Activity,  permission: 'maintenance.view' },
      { href: '/system/backups', label: '备份管理', icon: HardDrive, permission: 'maintenance.view' },
    ],
  },
  {
    items: [
      { href: '/admin-users',          label: 'Admin Users',      icon: UserCog,    permission: 'staff.manage' },
      { href: '/settings/staff',       label: 'Staff Manager',    icon: Users,      permission: 'staff.manage' },
      { href: '/settings/permissions', label: 'Staff Permissions',icon: ShieldCheck,permission: 'staff.manage' },
      { href: '/settings',             label: 'Settings',          icon: Settings, exact: true },
      { href: '/maintenance',          label: 'Maintenance',       icon: Wrench,    permission: 'maintenance.view' },
    ],
  },
];

interface MeData { isSuperAdmin: boolean; permissions: string[] }
interface BrandData { brand_name: string; logo_media_id: number | null }

export function filterNavGroups(
  groups: NavGroup[],
  isSuperAdmin: boolean,
  permissions: string[]
): NavGroup[] {
  const permSet = new Set(permissions);
  return groups.map((g) => ({
    ...g,
    items: g.items.filter((item) => {
      if (!item.permission) return true;
      if (isSuperAdmin) return true;
      return permSet.has(item.permission);
    }),
  })).filter((g) => g.items.length > 0);
}

function isActive(href: string, pathname: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [me, setMe] = useState<MeData>({ isSuperAdmin: false, permissions: [] });
  const [brand, setBrand] = useState<BrandData>({ brand_name: 'ERP Admin', logo_media_id: null });

  const loadMe = useCallback(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MeData | null) => { if (d) setMe(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadMe();
    fetch('/api/maintenance/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { maintenance_mode: boolean } | null) => {
        if (d?.maintenance_mode) setMaintenanceOn(true);
      })
      .catch(() => {});
    fetch('/api/public/brand')
      .then((r) => (r.ok ? r.json() : null))
      .then((b: BrandData | null) => { if (b?.brand_name) setBrand(b); })
      .catch(() => {});
  }, [loadMe]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-white">
      <div className="border-b px-4 py-4 flex items-center gap-2">
        {brand.logo_media_id
          ? <img src={`/api/public/media/${brand.logo_media_id}`} alt="logo" className="h-6 w-auto" />
          : null}
        <span className="text-base font-semibold tracking-tight truncate">{brand.brand_name}</span>
      </div>

      {maintenanceOn && (
        <div className="mx-2 mt-2 rounded-md bg-red-50 border border-red-300 px-3 py-2 text-xs text-red-700 font-medium">
          Maintenance mode is ON
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2">
        {filterNavGroups(NAV_GROUPS, me.isSuperAdmin, me.permissions).map((group, gi) => (
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
