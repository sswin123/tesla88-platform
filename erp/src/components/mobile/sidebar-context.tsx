'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { subscribeSSE } from '@/lib/sse-manager';
import { playNotification, unlockAudio, preloadAllNotifications } from '@/lib/notification-audio';
import { NAV_GROUPS, filterNavGroups, type NavGroup } from '@/components/sidebar-nav';
import { useHeartbeat } from '@/hooks/useHeartbeat';

interface MeData { isSuperAdmin: boolean; permissions: string[] }
interface BrandData { brand_name: string; logo_media_id: number | null }

export interface SidebarContextValue {
  brand: BrandData;
  me: MeData;
  livechatUnread: number;
  pendingCount: number;
  maintenanceOn: boolean;
  filteredNavGroups: NavGroup[];
  handleLogout: () => Promise<void>;
}

const SidebarStateContext = createContext<SidebarContextValue | null>(null);

export function useSidebarState(): SidebarContextValue {
  const ctx = useContext(SidebarStateContext);
  if (!ctx) throw new Error('useSidebarState must be used within SidebarStateProvider');
  return ctx;
}

export function SidebarStateProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [me, setMe] = useState<MeData>({ isSuperAdmin: false, permissions: [] });
  const [brand, setBrand] = useState<BrandData>({ brand_name: 'ERP Admin', logo_media_id: null });
  const [brandLoaded, setBrandLoaded] = useState(false);
  const [livechatUnread, setLivechatUnread] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const refreshTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reminderInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifIntervalMs  = useRef<number>(3000);
  const pendingCountRef  = useRef<number>(0);

  useHeartbeat();

  const filteredNavGroups = useMemo(
    () => filterNavGroups(NAV_GROUPS, me.isSuperAdmin, me.permissions),
    // me.permissions is a new array reference on every setMe call (once at mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me.isSuperAdmin, me.permissions],
  );

  const handlePendingCountUpdate = useCallback((newCount: number) => {
    pendingCountRef.current = newCount;
    setPendingCount(newCount);
    if (newCount > 0) {
      if (!reminderInterval.current) {
        playNotification('transaction');
        reminderInterval.current = setInterval(() => {
          fetch('/api/transactions/pending-count')
            .then((r) => r.ok ? r.json() : null)
            .then((d: { count: number } | null) => {
              if (d === null) return;
              const c = d.count ?? 0;
              setPendingCount(c);
              pendingCountRef.current = c;
              if (c === 0) {
                clearInterval(reminderInterval.current!);
                reminderInterval.current = null;
              } else {
                playNotification('transaction');
              }
            })
            .catch(() => {});
        }, notifIntervalMs.current);
      }
    } else {
      if (reminderInterval.current) {
        clearInterval(reminderInterval.current);
        reminderInterval.current = null;
      }
    }
  }, []);

  const loadMe = useCallback(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MeData | null) => { if (d) setMe(d); })
      .catch(() => {});
  }, []);

  // Unlock AudioContext + preload sounds on first user interaction
  useEffect(() => {
    const onFirstClick = () => { unlockAudio(); preloadAllNotifications(); };
    document.addEventListener('click', onFirstClick, { once: true });
    return () => document.removeEventListener('click', onFirstClick);
  }, []);

  // Reset livechat unread when user navigates to /livechat
  useEffect(() => {
    if (pathname.startsWith('/livechat')) {
      setLivechatUnread(0);
      fetch('/api/livechat/unread', { method: 'POST' }).catch(() => {});
    }
  }, [pathname]);

  // Keep browser title in sync
  useEffect(() => {
    if (!brandLoaded) return;
    const base  = `${brand.brand_name} ERP`;
    const title = pendingCount > 0 ? `(${pendingCount}) ${base}` : base;
    document.title = title;
    const reassert = () => { if (!document.hidden) document.title = title; };
    document.addEventListener('visibilitychange', reassert);
    window.addEventListener('erp:titleassert', reassert);
    return () => {
      document.removeEventListener('visibilitychange', reassert);
      window.removeEventListener('erp:titleassert', reassert);
    };
  }, [pendingCount, brand.brand_name, brandLoaded]);

  useEffect(() => {
    loadMe();

    fetch('/api/maintenance/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { maintenance_mode: boolean } | null) => {
        if (d?.maintenance_mode) setMaintenanceOn(true);
      })
      .catch(() => {});

    let brandRetryTimer: ReturnType<typeof setTimeout> | null = null;
    const fetchBrand = () => {
      fetch('/api/public/brand')
        .then((r) => (r.ok ? r.json() : null))
        .then((b: BrandData | null) => {
          if (b?.brand_name) { setBrand(b); setBrandLoaded(true); }
          else { brandRetryTimer = setTimeout(fetchBrand, 30_000); }
        })
        .catch(() => { brandRetryTimer = setTimeout(fetchBrand, 30_000); });
    };
    fetchBrand();

    if (!window.location.pathname.startsWith('/livechat')) {
      fetch('/api/livechat/unread')
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { count: number } | null) => { if (d !== null) setLivechatUnread(d.count ?? 0); })
        .catch(() => {});
    }

    fetch('/api/transactions/pending-count')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count: number } | null) => { if (d) handlePendingCountUpdate(d.count ?? 0); })
      .catch(() => {});

    fetch('/api/settings/notifications')
      .then((r) => r.ok ? r.json() : null)
      .then((d: { reminder_interval_ms?: number } | null) => {
        if (d?.reminder_interval_ms) notifIntervalMs.current = d.reminder_interval_ms;
      })
      .catch(() => {});

    const unsubChat = subscribeSSE('/api/livechat/stream', (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data as string) as { sender_type?: string; type?: string };
        if (evt.type === 'new_message' && evt.sender_type === 'USER') {
          setLivechatUnread((n) => {
            if (window.location.pathname.startsWith('/livechat')) return n;
            playNotification('livechat');
            return n + 1;
          });
        }
      } catch { /* ignore malformed SSE */ }
    });

    const unsubTx = subscribeSSE('/api/transactions/stream', () => {
      if (refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        fetch('/api/transactions/pending-count')
          .then((r) => r.ok ? r.json() : null)
          .then((d: { count: number } | null) => { if (d) handlePendingCountUpdate(d.count ?? 0); })
          .catch(() => {});
      }, 250);
    });

    const handleIntervalChange = (e: Event) => {
      const ms = (e as CustomEvent<number>).detail;
      if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < 1000 || ms > 10000) return;
      notifIntervalMs.current = ms;
      if (reminderInterval.current !== null) {
        clearInterval(reminderInterval.current);
        reminderInterval.current = null;
        if (pendingCountRef.current > 0) handlePendingCountUpdate(pendingCountRef.current);
      }
    };
    window.addEventListener('erp:notif-interval-changed', handleIntervalChange);

    return () => {
      unsubChat();
      unsubTx();
      if (brandRetryTimer) clearTimeout(brandRetryTimer);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (reminderInterval.current) {
        clearInterval(reminderInterval.current);
        reminderInterval.current = null;
      }
      window.removeEventListener('erp:notif-interval-changed', handleIntervalChange);
    };
  }, [loadMe, handlePendingCountUpdate]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }, [router]);

  return (
    <SidebarStateContext.Provider value={{
      brand, me, livechatUnread, pendingCount, maintenanceOn, filteredNavGroups, handleLogout,
    }}>
      {children}
    </SidebarStateContext.Provider>
  );
}
