import type { Metadata, Viewport } from 'next';
import './globals.css';
import pool from '@/lib/db';
import { getBrand } from '@/lib/brand';
import { resolveDesignVars } from '@/lib/design-themes';
import CasinoHeader from './components/CasinoHeader';
import { parseHeaderConfig, type HeaderConfig } from '@/lib/header-config';
import BottomNav from './components/BottomNav';
import MemberPanel from './components/MemberPanel';
import FloatingSupport from './components/FloatingSupport';
import PwaRegister from './components/PwaRegister';
import Providers from './providers';
import type { PublicAnnouncement } from './api/public/announcements/route';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

async function getHeaderConfig(): Promise<HeaderConfig | null> {
  try {
    const res = await pool.query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'header_config'"
    );
    const raw = res.rows[0]?.value;
    if (!raw) return null;
    return parseHeaderConfig(raw);
  } catch {
    return null;
  }
}

async function getActiveAnnouncements(): Promise<PublicAnnouncement[]> {
  try {
    const res = await pool.query<PublicAnnouncement>(
      `SELECT id, title, message, type, link_url, display_order
       FROM website_announcements
       WHERE is_active = TRUE
         AND (start_at IS NULL OR start_at <= NOW())
         AND (end_at   IS NULL OR end_at   >  NOW())
       ORDER BY display_order ASC, id ASC`
    );
    return res.rows;
  } catch {
    return [];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const iconId = brand.favicon_media_id ?? brand.logo_media_id;
  return {
    title: brand.seo_title || brand.brand_name,
    description: brand.seo_description || undefined,
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: brand.brand_name,
    },
    formatDetection: { telephone: false },
    icons: iconId
      ? {
          icon: `/api/public/media/${iconId}`,
          apple: `/api/public/media/${iconId}`,
        }
      : undefined,
  };
}

// Header height = logo pixel height + 8px padding (4px top + 4px bottom)
const HEADER_H_MAP: Record<string, string> = {
  small:  '40px',  // h-8  = 32px + 8
  medium: '50px',  // h-10 = 40px + 10 (compact)
  large:  '64px',  // h-14 = 56px + 8
  xlarge: '80px',  // h-18 = 72px + 8
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [brand, announcements, headerConfig] = await Promise.all([
    getBrand(),
    getActiveAnnouncements(),
    getHeaderConfig(),
  ]);

  const headerH = HEADER_H_MAP[brand.logo_size ?? 'medium'] ?? '60px';

  const hasTicker = announcements.length > 0;

  /* Total offset from top = header + optional ticker + safe area (iPhone notch) */
  const topOffset = hasTicker
    ? 'calc(var(--header-h) + var(--ticker-h) + env(safe-area-inset-top, 0px))'
    : 'calc(var(--header-h) + env(safe-area-inset-top, 0px))';

  // Resolve the full design token set from the selected preset + any custom overrides
  const designVars = resolveDesignVars(brand.design_preset ?? 'classic_purple', brand.design_overrides ?? {});

  // When a design_preset is explicitly set, it is the single source of truth.
  // Legacy brand color fields (primary_color etc.) only apply when NO preset is chosen,
  // so that selecting a theme completely recolors the site without interference.
  const hasPreset = !!brand.design_preset;
  const cssVars: React.CSSProperties = {
    '--header-h': headerH,
    '--bg-elevated': 'var(--bg-surface)',  // alias: darkest elevated surface
    ...designVars,
    // Legacy overrides — only when no preset is active
    ...(!hasPreset && {
      '--brand-primary':   brand.primary_color  || designVars['--brand-primary'],
      '--brand-secondary': brand.secondary_color || designVars['--brand-secondary'],
      '--bg-base':         brand.color_bg        || designVars['--bg-base'],
      '--bg-card':         brand.color_card      || designVars['--bg-card'],
      '--text-base':       brand.color_text      || designVars['--text-base'],
    }),
  } as React.CSSProperties;

  return (
    <html lang="en" style={cssVars}>
      <body style={{ background: 'var(--bg-base)', color: 'var(--text-base)' }}>
        {/* ── Sticky header + optional ticker ── */}
        <CasinoHeader
          brand={brand}
          announcements={announcements}
          headerConfig={headerConfig}
        />

        {/* ── Page shell ──────────────────────── */}
        <div
          style={{
            paddingTop: topOffset,
            /* Extra bottom padding on mobile for the fixed bottom nav */
            paddingBottom: 'calc(var(--bottomnav-h) + env(safe-area-inset-bottom, 0px))',
          }}
          className="lg:pb-0"
        >
          {/* Responsive container with optional sidebar on desktop */}
          <div className="max-w-7xl mx-auto px-3 py-2">
            <Providers>
            <div className="flex gap-3 items-start">

              {/* Member panel: sidebar on desktop, hidden on mobile */}
              <aside className="hidden lg:block w-56 shrink-0 sticky" style={{ top: topOffset }}>
                <MemberPanel />
              </aside>

              {/* Main content */}
              <main className="flex-1 min-w-0">
                {children}
              </main>

            </div>
          </Providers>
          </div>
        </div>

        {/* ── Fixed bottom nav (mobile only) ── */}
        <BottomNav />

        {/* ── Floating support button (desktop only) ── */}
        <FloatingSupport whatsapp={brand.support_whatsapp} telegram={brand.support_telegram} />

        {/* ── PWA service worker registration ── */}
        <PwaRegister />
      </body>
    </html>
  );
}
