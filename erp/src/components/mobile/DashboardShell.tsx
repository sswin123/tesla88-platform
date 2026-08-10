'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { SidebarStateProvider } from '@/components/mobile/sidebar-context';
import { Sidebar } from '@/components/sidebar';
import { MobileSidebarDrawer } from '@/components/mobile/MobileSidebarDrawer';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { BottomTabBar } from '@/components/mobile/BottomTabBar';

export function DashboardShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer  = useCallback(() => setDrawerOpen(true),  []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <SidebarStateProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Desktop sidebar — hidden on mobile (lg:flex) */}
        <Sidebar />

        {/* Mobile slide-out drawer — hidden on desktop (lg:hidden inside component) */}
        <MobileSidebarDrawer isOpen={drawerOpen} onClose={closeDrawer} />

        {/* Main column: header + content + bottom nav */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Mobile sticky header (lg:hidden) */}
          <MobileHeader onOpenDrawer={openDrawer} isDrawerOpen={drawerOpen} />

          {/* Page content — extra bottom padding on mobile for the tab bar */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-4 pb-20 lg:p-6 lg:pb-6">
            {children}
          </main>

          {/* Bottom tab bar (lg:hidden via fixed positioning + lg:hidden class) */}
          <BottomTabBar onOpenDrawer={openDrawer} />
        </div>
      </div>
    </SidebarStateProvider>
  );
}
