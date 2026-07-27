'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
  KeyRound,
  Handshake,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { subscribeSSE } from '@/lib/sse-manager';

type NavItem  = { href: string; label: string; icon: React.ElementType; exact?: boolean; permission?: string };
type NavGroup = { title?: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: '/',            label: 'Dashboard',   icon: LayoutDashboard, exact: true, permission: 'dashboard.view' },
      { href: '/members',     label: 'Members',     icon: Users,           permission: 'members.view' },
      { href: '/transactions', label: 'Transactions', icon: CreditCard, permission: 'deposit.view' },
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
      { href: '/gaming-platform',              label: 'Provider Registry', icon: Gamepad2,          permission: 'game.manage' },
      { href: '/gaming-platform/games-library',label: 'Games Library',      icon: Joystick,          permission: 'game.manage' },
      { href: '/accounts',                     label: 'Game Accounts',      icon: Database,          permission: 'game.manage' },
      { href: '/providers',                    label: 'Legacy Providers',   icon: SlidersHorizontal, permission: 'game.manage' },
      { href: '/provider-settings',            label: 'Provider Callbacks', icon: Activity,          permission: 'game.manage' },
      { href: '/provider-playground',          label: 'API Playground',     icon: Zap,               permission: 'game.manage' },
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
      { href: '/website-builder/partner-builder',        label: 'Partner Builder',  icon: Handshake,          permission: 'website.builder.manage' },
      { href: '/website-builder/website-config',         label: 'Website Config',   icon: SlidersHorizontal, permission: 'website.builder.manage' },
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
      { href: '/system/health',          label: '健康监控',            icon: Activity,    permission: 'maintenance.view' },
      { href: '/system/backups',         label: '备份管理',            icon: HardDrive,   permission: 'maintenance.view' },
      { href: '/registration-security',  label: 'Registration Security', icon: ShieldCheck, permission: 'settings.manage' },
    ],
  },
  {
    items: [
      { href: '/settings/staff',       label: 'Staff Manager',    icon: Users,      permission: 'staff.manage' },
      { href: '/settings/permissions', label: 'Staff Permissions',icon: ShieldCheck,permission: 'staff.manage' },
      { href: '/settings',             label: 'Settings',          icon: Settings, exact: true, permission: 'website.settings' },
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

// Interval (ms) between repeated notification beeps while pending transactions exist.
// Increase this value to reduce frequency; decrease to alert more aggressively.
const NOTIFICATION_REPEAT_INTERVAL_MS = 5_000;

// VERSION MARKER — visible in browser console to confirm new code is deployed.
// If you do NOT see this line in console, the container is still running old code.
if (typeof window !== 'undefined') {
  console.log('[sidebar] VERSION=e3a2f1c loaded — brandLoaded guard: title never uses hardcoded fallback');
}

// Persistent shared AudioContext.
// Creating a new AudioContext inside a setInterval callback (no user gesture) causes
// the browser to start it in "suspended" state — audio is silently blocked.
// Reusing a single context that was created/resumed during a prior user gesture keeps
// it in "running" state across all subsequent interval beeps.
let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new Ctor();
    }
    return _audioCtx;
  } catch {
    return null;
  }
}

function playNotifBeep(): void {
  try {
    const ctx = getAudioCtx();
    if (!ctx) { console.log('[sidebar:beep] no AudioContext available'); return; }
    console.log('[sidebar:beep] AudioContext state =', ctx.state);
    const scheduleNote = () => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
      console.log('[sidebar:beep] note scheduled at t=', ctx.currentTime);
    };
    if (ctx.state === 'suspended') {
      console.log('[sidebar:beep] context suspended — calling resume()');
      void ctx.resume().then(() => {
        console.log('[sidebar:beep] resume() resolved, state now =', ctx.state);
        scheduleNote();
      }).catch((err) => {
        console.warn('[sidebar:beep] resume() REJECTED:', err);
      });
    } else {
      scheduleNote();
    }
  } catch (err) {
    console.error('[sidebar:beep] exception:', err);
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [me, setMe] = useState<MeData>({ isSuperAdmin: false, permissions: [] });
  const [brand, setBrand] = useState<BrandData>({ brand_name: 'ERP Admin', logo_media_id: null });
  const [brandLoaded, setBrandLoaded] = useState(false);
  const [livechatUnread, setLivechatUnread] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const refreshTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reminderInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const filteredNavGroups = useMemo(
    () => filterNavGroups(NAV_GROUPS, me?.isSuperAdmin ?? false, me?.permissions ?? []),
    // me.permissions is an array reference — changes on every setMe call (once at mount).
    // Using it here means memo invalidates when /api/auth/me returns, not on every SSE re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me?.isSuperAdmin, me?.permissions]
  );

  // Central handler for every pending-count update.
  // Starts the repeat-beep reminder when pending > 0; stops it when pending reaches 0.
  // Guarantees at most one setInterval exists at any time.
  const handlePendingCountUpdate = useCallback((newCount: number) => {
    console.log('[sidebar:pending] handlePendingCountUpdate called, count =', newCount, ', interval running =', !!reminderInterval.current);
    setPendingCount(newCount);
    if (newCount > 0) {
      if (!reminderInterval.current) {
        // First pending item: play immediately then repeat on interval
        console.log('[sidebar:pending] starting reminder interval');
        playNotifBeep();
        reminderInterval.current = setInterval(() => {
          console.log('[sidebar:pending] interval tick — fetching pending-count...');
          // Fetch count BEFORE playing — ensures we never beep for Processing-only queues.
          // The SSE handler is the fast path (stops reminder instantly via handlePendingCountUpdate).
          // This interval is the safety-net poll in case an SSE event was missed.
          fetch('/api/transactions/pending-count')
            .then((r) => {
              console.log('[sidebar:pending] pending-count HTTP status =', r.status, r.ok);
              return r.ok ? r.json() : null;
            })
            .then((d: { count: number } | null) => {
              if (d === null) { console.warn('[sidebar:pending] pending-count returned error — NOT clearing interval'); return; }
              const c = d.count ?? 0;
              console.log('[sidebar:pending] pending-count =', c);
              setPendingCount(c);
              if (c === 0) {
                console.log('[sidebar:pending] count is 0 — clearing interval');
                clearInterval(reminderInterval.current!);
                reminderInterval.current = null;
              } else {
                playNotifBeep();
              }
            })
            .catch((err) => { console.error('[sidebar:pending] interval fetch error:', err); });
        }, NOTIFICATION_REPEAT_INTERVAL_MS);
      }
      // Interval already running — let it continue; don't create a duplicate
    } else {
      // No pending transactions: stop reminding
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

  // Warm-up: unlock and resume the shared AudioContext on the first user click.
  // Ensures subsequent setInterval beeps are not silenced by the browser autoplay policy.
  useEffect(() => {
    const unlock = () => {
      const ctx = getAudioCtx();
      if (ctx?.state === 'suspended') void ctx.resume();
    };
    document.addEventListener('click', unlock, { once: true });
    return () => document.removeEventListener('click', unlock);
  }, []);

  // Auto-reset unread when user is on /livechat
  useEffect(() => {
    if (pathname.startsWith('/livechat')) setLivechatUnread(0);
  }, [pathname]);

  // Browser title — only runs after Brand Center value is confirmed by /api/public/brand.
  // Guarded by brandLoaded so the initial 'ERP Admin' fallback never appears in the title;
  // the server-rendered title from generateMetadata() persists until the brand API resolves.
  // Listens on visibilitychange and 'erp:titleassert' to restore the correct title after
  // ConversationList's livechat flash notification overwrites it.
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

    // Brand fetch with retry — if the API fails (network error, 500, or empty response),
    // schedule a retry after 30 s so the title eventually recovers once the brand API
    // comes back online. brandLoaded stays false until a successful fetch, so the
    // server-rendered title from generateMetadata() persists during the failure window.
    let brandRetryTimer: ReturnType<typeof setTimeout> | null = null;
    const fetchBrand = () => {
      fetch('/api/public/brand')
        .then((r) => (r.ok ? r.json() : null))
        .then((b: BrandData | null) => {
          if (b?.brand_name) {
            setBrand(b);
            setBrandLoaded(true);
          } else {
            // Non-ok response or missing brand_name — retry after 30 s
            brandRetryTimer = setTimeout(fetchBrand, 30_000);
          }
        })
        .catch(() => {
          // Network error or timeout — retry after 30 s
          brandRetryTimer = setTimeout(fetchBrand, 30_000);
        });
    };
    fetchBrand();

    // Fetch initial livechat unread count
    fetch('/api/livechat/unread')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count: number } | null) => { if (d?.count) setLivechatUnread(d.count); })
      .catch(() => {});

    // Fetch initial transactions pending count and start reminder if needed
    fetch('/api/transactions/pending-count')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count: number } | null) => { if (d) handlePendingCountUpdate(d.count ?? 0); })
      .catch(() => {});

    // SSE: live chat — increment unread + play sound when customer sends a message
    const unsubChat = subscribeSSE('/api/livechat/stream', (e: MessageEvent) => {
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
    });

    // SSE: transactions — throttled 250ms refresh; reminder lifecycle handled by handlePendingCountUpdate
    const unsubTx = subscribeSSE('/api/transactions/stream', () => {
      console.log('[sidebar:sse] transaction SSE event received');
      if (refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        fetch('/api/transactions/pending-count')
          .then((r) => {
            console.log('[sidebar:sse] SSE-triggered pending-count HTTP status =', r.status, r.ok);
            return r.ok ? r.json() : null;
          })
          .then((d: { count: number } | null) => {
            if (d) handlePendingCountUpdate(d.count ?? 0);
            else console.warn('[sidebar:sse] pending-count returned error — skipping update');
          })
          .catch((err) => { console.error('[sidebar:sse] SSE-triggered fetch error:', err); });
      }, 250);
    });

    return () => {
      unsubChat();
      unsubTx();
      if (brandRetryTimer) clearTimeout(brandRetryTimer);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (reminderInterval.current) {
        clearInterval(reminderInterval.current);
        reminderInterval.current = null;
      }
    };
  }, [loadMe, handlePendingCountUpdate]);

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
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            pathname === '/settings/profile'
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          )}
        >
          <KeyRound size={16} />
          Change Password
        </Link>
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
