export const VALID_MODULES = [
  'dashboard', 'member', 'deposit', 'withdrawal', 'promotion', 'livechat',
  'attendance', 'staff', 'settings', 'reports', 'announcement', 'risk',
  'finance', 'analytics', 'website', 'media', 'audit', 'system',
] as const;
export type StaffModule = (typeof VALID_MODULES)[number];

export const VALID_PAGES = [
  'list', 'detail', 'approval', 'edit', 'create', 'view', 'settings', 'export', 'stream',
] as const;
export type StaffPage = (typeof VALID_PAGES)[number];

export function isValidModule(v: string): v is StaffModule {
  return (VALID_MODULES as readonly string[]).includes(v);
}
export function isValidPage(v: string): v is StaffPage {
  return (VALID_PAGES as readonly string[]).includes(v);
}

interface RouteMapping { prefix: string; module: StaffModule; page: StaffPage }

// Order matters: more specific prefixes must come before their parent prefix.
const ROUTE_MAP: RouteMapping[] = [
  { prefix: '/members',                module: 'member',       page: 'list' },
  { prefix: '/transactions',           module: 'deposit',      page: 'list' },
  { prefix: '/livechat/quick-replies', module: 'livechat',     page: 'settings' },
  { prefix: '/livechat',               module: 'livechat',     page: 'list' },
  { prefix: '/promotions',             module: 'promotion',    page: 'list' },
  { prefix: '/announcements',          module: 'announcement', page: 'list' },
  { prefix: '/finance',                module: 'finance',      page: 'view' },
  { prefix: '/analytics',              module: 'analytics',    page: 'view' },
  { prefix: '/risk',                   module: 'risk',         page: 'list' },
  { prefix: '/staff/attendance',       module: 'attendance',   page: 'list' },
  { prefix: '/staff/live-monitor',     module: 'staff',        page: 'view' },
  { prefix: '/settings/staff',         module: 'staff',        page: 'list' },
  { prefix: '/settings/permissions',   module: 'staff',        page: 'settings' },
  { prefix: '/settings',               module: 'settings',     page: 'view' },
  { prefix: '/website-builder',        module: 'website',      page: 'edit' },
  { prefix: '/media-library',          module: 'media',        page: 'list' },
  { prefix: '/audit',                  module: 'audit',        page: 'list' },
  { prefix: '/system',                 module: 'system',       page: 'view' },
];

export function resolveModuleFromPath(pathname: string): { module: StaffModule; page: StaffPage } {
  if (pathname === '/') return { module: 'dashboard', page: 'view' };
  for (const entry of ROUTE_MAP) {
    if (pathname === entry.prefix || pathname.startsWith(entry.prefix + '/')) {
      return { module: entry.module, page: entry.page };
    }
  }
  return { module: 'dashboard', page: 'view' };
}
