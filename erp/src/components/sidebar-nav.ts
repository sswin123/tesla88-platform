import type { ElementType } from 'react';
import {
  LayoutDashboard,
  Users,
  Landmark,
  Gift,
  ScrollText,
  MessageSquare,
  BarChart2,
  TrendingUp,
  ShieldAlert,
  Gamepad2,
  Database,
  Megaphone,
  Settings,
  Wrench,
  ShieldCheck,
  Bot,
  Images,
  Zap,
  Radio,
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
  Handshake,
  Tag,
  Store,
  Eye,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: ElementType;
  exact?: boolean;
  permission?: string;
};

export type NavGroup = {
  title?: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: '/',             label: 'Dashboard',     icon: LayoutDashboard, exact: true, permission: 'dashboard.view' },
      { href: '/members',      label: 'Members',       icon: Users,           permission: 'members.view' },
      { href: '/transactions', label: 'Transactions',  icon: CreditCard,      permission: 'deposit.view' },
      { href: '/livechat',     label: 'Live Chat',     icon: MessageSquare,   permission: 'livechat.view', exact: true },
      { href: '/livechat/quick-replies', label: 'Quick Replies',   icon: Zap, permission: 'livechat.view', exact: true },
      { href: '/livechat/tags',          label: 'Tag Management', icon: Tag, permission: 'livechat.manage', exact: true },
    ],
  },
  {
    items: [
      { href: '/banks',         label: 'Bank Manager',  icon: Landmark,  permission: 'banks.manage' },
      { href: '/promotions',    label: 'Promotions',    icon: Gift,      permission: 'promotions.manage' },
      { href: '/announcements', label: 'Announcements', icon: Megaphone, permission: 'announcements.manage' },
      { href: '/broadcast',     label: 'Broadcast',     icon: Radio,     permission: 'broadcast.manage' },
      { href: '/audit',         label: 'Audit Log',     icon: ScrollText, permission: 'audit.view' },
    ],
  },
  {
    items: [
      { href: '/finance',    label: 'Finance Reports',  icon: BarChart2,        permission: 'finance.view' },
      { href: '/analytics',  label: 'Member Analytics', icon: TrendingUp,       permission: 'analytics.view' },
      { href: '/risk',       label: 'Risk Center',      icon: ShieldAlert,      permission: 'risk.view' },
      { href: '/gaming-platform',               label: 'Provider Registry', icon: Gamepad2,          permission: 'game.manage', exact: true },
      { href: '/gaming-platform/games-library', label: 'Games Library',     icon: Joystick,          permission: 'game.manage', exact: true },
      { href: '/accounts',                      label: 'Game Accounts',     icon: Database,          permission: 'game.manage', exact: true },
      { href: '/providers',                     label: 'Legacy Providers',  icon: SlidersHorizontal, permission: 'game.manage', exact: true },
      { href: '/provider-settings',             label: 'Provider Callbacks',icon: Activity,          permission: 'game.manage' },
      { href: '/provider-playground',           label: 'API Playground',    icon: Zap,               permission: 'game.manage' },
    ],
  },
  {
    title: 'Brand Center',
    items: [
      { href: '/brand-center', label: 'Brands', icon: Store, permission: 'game.manage' },
    ],
  },
  {
    title: 'Control Center',
    items: [
      { href: '/settings/brand',        label: 'Brand Center',  icon: Building2, permission: 'brand.settings' },
      { href: '/settings/bot',          label: 'Telegram Bot',  icon: Bot,       permission: 'bot.settings', exact: true },
      { href: '/settings/bot/messages', label: 'Bot Messages',  icon: FileText,  permission: 'bot.messages' },
      { href: '/media-library',         label: 'Media Library', icon: Images,    permission: 'media.view' },
    ],
  },
  {
    title: 'Staff',
    items: [
      { href: '/settings/staff',       label: 'Staff List',       icon: Users,       permission: 'staff.manage' },
      { href: '/settings/permissions', label: 'Staff Permission', icon: ShieldCheck, permission: 'staff.manage' },
      { href: '/staff/live-monitor',   label: 'Live Monitor',     icon: Eye,         permission: 'staff.livemonitor.view' },
    ],
  },
  {
    title: 'Website',
    items: [
      { href: '/website-builder',                         label: 'Website Builder',  icon: Layout,            permission: 'website.builder.manage', exact: true },
      { href: '/design-system',                           label: 'Design System',    icon: Palette,           permission: 'website.builder.manage' },
      { href: '/website-builder/header-builder',          label: 'Header Builder',   icon: PanelTop,          permission: 'website.builder.manage', exact: true },
      { href: '/website-builder/partner-builder',         label: 'Partner Builder',  icon: Handshake,         permission: 'website.builder.manage', exact: true },
      { href: '/website-builder/website-config',          label: 'Website Config',   icon: SlidersHorizontal, permission: 'website.builder.manage', exact: true },
      { href: '/apk-manager',              label: 'APK Manager',      icon: Smartphone, permission: 'website.settings' },
      { href: '/website-banners',          label: 'Banners',          icon: Image,      permission: 'website.banner.manage' },
      { href: '/website-announcements',    label: 'Announcements',    icon: Bell,       permission: 'website.announcement.manage' },
      { href: '/website-lobby-categories', label: 'Lobby Categories', icon: Joystick,   permission: 'website.game.manage' },
      { href: '/website-game-providers',   label: 'Game Providers',   icon: Joystick,   permission: 'website.game.manage' },
      { href: '/website-games',            label: 'Games Library',    icon: Joystick,   permission: 'website.game.manage' },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/system/health',         label: '健康监控',              icon: Activity,    permission: 'maintenance.view' },
      { href: '/system/backups',        label: '备份管理',              icon: HardDrive,   permission: 'maintenance.view' },
      { href: '/registration-security', label: 'Registration Security', icon: ShieldCheck, permission: 'settings.manage' },
    ],
  },
  {
    items: [
      { href: '/settings',            label: 'Settings',    icon: Settings, exact: true, permission: 'website.settings' },
      { href: '/settings/appearance', label: 'Appearance',  icon: Palette },
      { href: '/maintenance',         label: 'Maintenance', icon: Wrench,   permission: 'maintenance.view' },
    ],
  },
];

export function filterNavGroups(
  groups: NavGroup[],
  isSuperAdmin: boolean,
  permissions: string[],
): NavGroup[] {
  const permSet = new Set(permissions);
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        if (!item.permission) return true;
        if (isSuperAdmin) return true;
        return permSet.has(item.permission);
      }),
    }))
    .filter((g) => g.items.length > 0);
}

export function isActive(href: string, pathname: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}
