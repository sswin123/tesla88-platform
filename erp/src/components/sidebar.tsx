'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { KeyRound, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isActive } from '@/components/sidebar-nav';
import { useSidebarState } from '@/components/mobile/sidebar-context';

// Re-export nav definitions for any consumers that imported them from here
export { NAV_GROUPS, filterNavGroups, isActive, type NavItem, type NavGroup } from '@/components/sidebar-nav';

// VERSION MARKER — visible in browser console to confirm new code is deployed.
if (typeof window !== 'undefined') {
  console.log('[sidebar] VERSION=f8b3e2a loaded — notification-audio shared module');
}

interface SidebarContentProps {
  onNavigate?: () => void;
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const { brand, maintenanceOn, filteredNavGroups, livechatUnread, pendingCount, handleLogout } =
    useSidebarState();
  const pathname = usePathname();

  return (
    <>
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

      <nav className="flex-1 overflow-y-auto p-2" aria-label="Main navigation">
        {filteredNavGroups.map((group, gi) => (
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
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive(href, pathname, exact)
                    ? 'bg-gray-100 font-medium text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {href === '/livechat' && livechatUnread > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {livechatUnread > 99 ? '99+' : livechatUnread}
                  </span>
                )}
                {href === '/transactions' && pendingCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t p-2">
        <Link
          href="/settings/profile"
          onClick={onNavigate}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            pathname === '/settings/profile'
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
          )}
        >
          <KeyRound size={16} />
          Change Password
        </Link>
        <button
          onClick={() => { void handleLogout(); onNavigate?.(); }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        >
          <LogOut size={16} />
          Logout
        </button>
        <p className="mt-1 px-3 text-[10px] text-gray-300 select-none">v1.0.0</p>
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex h-full w-56 flex-shrink-0 flex-col border-r bg-white">
      <SidebarContent />
    </aside>
  );
}
