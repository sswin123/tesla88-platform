import type { AdminRole } from '@/lib/types';

const ROLE_RANK: Record<AdminRole, number> = {
  SUPER_ADMIN: 6,
  ADMIN:       5,
  FINANCE:     4,
  SUPERVISOR:  3,
  SUPPORT:     2,
  CS:          1,
};

export function hasMinRole(role: string | undefined, minRole: AdminRole): boolean {
  if (!role) return false;
  return (ROLE_RANK[role as AdminRole] ?? 0) >= ROLE_RANK[minRole];
}

const PAGE_ACCESS: Record<string, AdminRole[]> = {
  '/':              ['CS', 'SUPPORT', 'FINANCE', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'],
  '/finance':       ['FINANCE', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'],
  '/analytics':     ['FINANCE', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'],
  '/risk':          ['SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'],
  '/members':       ['FINANCE', 'SUPERVISOR', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN'],
  '/livechat':      ['CS', 'SUPPORT', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'],
  '/providers':     ['ADMIN', 'SUPER_ADMIN'],
  '/accounts':      ['ADMIN', 'SUPER_ADMIN'],
  '/announcements': ['SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'],
  '/settings':      ['SUPER_ADMIN'],
  '/maintenance':   ['SUPER_ADMIN'],
  '/banks':         ['ADMIN', 'SUPER_ADMIN'],
  '/promotions':    ['ADMIN', 'SUPER_ADMIN'],
  '/audit':         ['ADMIN', 'SUPER_ADMIN'],
};

export function canAccess(role: string | undefined, page: string): boolean {
  if (!role) return false;
  const allowed = PAGE_ACCESS[page] ?? [];
  return allowed.some(r => r === role);
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    FINANCE: 'Finance',
    SUPERVISOR: 'Supervisor',
    SUPPORT: 'Support',
    CS: 'CS',
  };
  return labels[role] ?? role;
}
