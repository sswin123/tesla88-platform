import type { Metadata } from 'next';
import './globals.css';
import pool from '@/lib/db';
import { getBrand } from '@/lib/brand';
import CasinoHeader from './components/CasinoHeader';
import BottomNav from './components/BottomNav';
import MemberPanel from './components/MemberPanel';
import FloatingSupport from './components/FloatingSupport';
import type { PublicAnnouncement } from './api/public/announcements/route';

export const dynamic = 'force-dynamic';

async function getFallbackBannerText(): Promise<string> {
  try {
    const res = await pool.query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'site_banner_text'"
    );
    return res.rows[0]?.value ?? '';
  } catch {
    return '';
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
  const meta: Metadata = {
    title: brand.seo_title || brand.brand_name,
    description: brand.seo_description || undefined,
  };
  if (brand.favicon_media_id) {
    meta.icons = { icon: `/api/public/media/${brand.favicon_media_id}` };
  }
  return meta;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [brand, announcements, fallbackText] = await Promise.all([
    getBrand(),
    getActiveAnnouncements(),
    getFallbackBannerText(),
  ]);

  /* Ticker shows if we have ERP announcements OR a legacy banner text */
  const hasTicker = announcements.length > 0 || !!fallbackText;

  /* Total offset from top = header + optional ticker */
  const topOffset = hasTicker
    ? 'calc(var(--header-h) + var(--ticker-h))'
    : 'var(--header-h)';

  return (
    <html
      lang="en"
      style={
        {
          '--brand-primary':   brand.primary_color,
          '--brand-secondary': brand.secondary_color,
        } as React.CSSProperties
      }
    >
      <body style={{ background: 'var(--bg-base)', color: 'var(--text-base)' }}>
        {/* ── Sticky header + optional ticker ── */}
        <CasinoHeader
          brand={brand}
          announcements={announcements}
          fallbackBannerText={announcements.length === 0 ? fallbackText : ''}
        />

        {/* ── Page shell ──────────────────────── */}
        <div
          style={{
            paddingTop: topOffset,
            /* Extra bottom padding on mobile for the fixed bottom nav */
            paddingBottom: 'var(--bottomnav-h)',
          }}
          className="lg:pb-0"
        >
          {/* Responsive container with optional sidebar on desktop */}
          <div className="max-w-7xl mx-auto px-4 py-5">
            <div className="flex gap-5 items-start">

              {/* Member panel: sidebar on desktop, hidden on mobile */}
              <aside className="hidden lg:block w-56 shrink-0 sticky" style={{ top: topOffset }}>
                <MemberPanel />
              </aside>

              {/* Main content */}
              <main className="flex-1 min-w-0">
                {children}
              </main>

            </div>
          </div>
        </div>

        {/* ── Fixed bottom nav (mobile only) ── */}
        <BottomNav />

        {/* ── Floating support button (desktop only) ── */}
        <FloatingSupport whatsapp={brand.support_whatsapp} telegram={brand.support_telegram} />
      </body>
    </html>
  );
}
