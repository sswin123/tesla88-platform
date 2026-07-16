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
  Layout,
  SlidersHorizontal,
  Palette,
  PanelTop,
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
      { href: '/providers',         label: 'Providers',          icon: Gamepad2,    permission: 'game.manage' },
      { href: '/accounts',          label: 'Game Accounts',      icon: Database,    permission: 'game.manage' },
      { href: '/provider-settings',   label: 'Provider Callbacks', icon: Activity,    permission: 'game.manage' },
      { href: '/provider-playground', label: 'API Playground',     icon: Zap,         permission: 'game.manage' },
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
      { href: '/website-builder',                        label: 'Website Builder',  icon: Layout,             permission: 'website.builder.manage' },
      { href: '/design-system',                          label: 'Design System',    icon: Palette,            permission: 'website.builder.manage' },
      { href: '/website-builder/header-builder',         label: 'Header Builder',   icon: PanelTop,           permission: 'website.builder.manage' },
      { href: '/website-builder/website-config',         label: 'Website Config',   icon: SlidersHorizontal, permission: 'website.builder.manage' },
      { href: '/website-settings',               label: 'Website Settings', icon: Globe,              permission: 'website.settings' },
      { href: '/apk-manager',             label: 'APK Manager',      icon: Smartphone, permission: 'website.settings' },
      { href: '/website-banners',         label: 'Banners',          icon: Image,      permission: 'website.banner.manage' },
      { href: '/website-announcements',   label: 'Announcements',    icon: Bell,       permission: 'website.announcement.manage' },
      { href: '/website-lobby-categories', label: 'Lobby Categories', icon: Joystick,   permission: 'website.game.manage' },
      { href: '/website-game-providers',  label: 'Game Providers',   icon: Joystick,   permission: 'website.game.manage' },
      { href: '/website-games',           label: 'Games Library',    icon: Joystick,   permission: 'website.game.manage' },
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

function playNotifBeep(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => { ctx.close(); };
  } catch { /* ignore */ }
}

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [me, setMe] = useState<MeData>({ isSuperAdmin: false, permissions: [] });
  const [brand, setBrand] = useState<BrandData>({ brand_name: 'ERP Admin', logo_media_id: null });
  const [livechatUnread, setLivechatUnread] = useState(0);
  const [depositsUnread, setDepositsUnread] = useState(0);

  const loadMe = useCallback(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MeData | null) => { if (d) setMe(d); })
      .catch(() => {});
  }, []);

  // Auto-reset unread when user is on /livechat
  useEffect(() => {
    if (pathname.startsWith('/livechat')) setLivechatUnread(0);
  }, [pathname]);

  // Auto-reset deposit badge when user navigates to /deposits
  useEffect(() => {
    if (pathname.startsWith('/deposits')) {
      setDepositsUnread(0);
      fetch('/api/deposits/unread', { method: 'POST' }).catch(() => {});
    }
  }, [pathname]);

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

    // Fetch initial livechat unread count
    fetch('/api/livechat/unread')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count: number } | null) => { if (d?.count) setLivechatUnread(d.count); })
      .catch(() => {});

    // Fetch initial deposit unread count
    fetch('/api/deposits/unread')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count: number } | null) => { if (d?.count) setDepositsUnread(d.count); })
      .catch(() => {});

    // SSE: live chat — increment unread + play sound when customer sends a message
    const chatEs = new EventSource('/api/livechat/stream');
    chatEs.onmessage = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data as string) as { sender_type?: string; type?: string };
        if (evt.type === 'new_message' && evt.sender_type === 'USER') {
          setLivechatUnread((n) => {
            if (window.location.pathname.startsWith('/livechat')) return n;
            playNotifBeep();
            return n + 1;
          });
        }
      } catch { /* ignore */ }
    };

    // SSE: deposits — increment badge + play sound when new pending deposit arrives
    const depositEs = new EventSource('/api/deposits/stream');
    depositEs.onmessage = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data as string) as { type?: string };
        if (evt.type === 'new_deposit') {
          setDepositsUnread((n) => {
            if (window.location.pathname.startsWith('/deposits')) return n;
            playNotifBeep();
            return n + 1;
          });
        }
      } catch { /* ignore */ }
    };

    return () => { chatEs.close(); depositEs.close(); };
  }, [loadMe]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-white">
      <div className="border-b px-4 py-4 flex items-center gap-2">
        {brand.logo_media_id && (
          <img
            src={`/api/public/media/${brand.logo_media_id}`}
            alt="logo"
            className="h-6 w-auto"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
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
                <span className="flex-1">{label}</span>
                {href === '/livechat' && livechatUnread > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {livechatUnread > 99 ? '99+' : livechatUnread}
                  </span>
                )}
                {href === '/deposits' && depositsUnread > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {depositsUnread > 99 ? '99+' : depositsUnread}
                  </span>
                )}
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
        <p className="mt-1 px-3 text-[10px] text-gray-300 select-none">
          v1.0.0
        </p>
      </div>
    </aside>
  );
}
