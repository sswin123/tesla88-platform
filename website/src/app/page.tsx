import pool from '@/lib/db';
import { getBrand } from '@/lib/brand';
import type { PublicPromotion } from '@/lib/types';
import PromoBanner from './components/PromoBanner';
import GameCard from './components/GameCard';

export const dynamic = 'force-dynamic';

async function getBannerText(): Promise<string> {
  try {
    const res = await pool.query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'site_banner_text'"
    );
    return res.rows[0]?.value ?? '';
  } catch {
    return '';
  }
}

async function getPromotions(): Promise<PublicPromotion[]> {
  try {
    const res = await pool.query<PublicPromotion>(
      `SELECT id, name, description, bonus_type, bonus_value, min_deposit, expiry_date
       FROM promotions
       WHERE is_active = TRUE AND deleted_at IS NULL
         AND (expiry_date IS NULL OR expiry_date > NOW())
       ORDER BY id DESC LIMIT 3`
    );
    return res.rows;
  } catch {
    return [];
  }
}

/* Quick-link cards shown in the hero area */
const QUICK_LINKS = [
  { emoji: '📱', title: 'Download App',  subtitle: 'Android APK',    href: '/download' },
  { emoji: '💬', title: 'Live Support',  subtitle: 'Chat with us',   href: '/chat' },
  { emoji: '🎁', title: 'Promotions',    subtitle: 'View offers',    href: '/promotions' },
  { emoji: '👤', title: 'My Account',    subtitle: 'Balance & history', href: '/dashboard' },
];

export default async function HomePage() {
  const [brand, bannerTextRaw, promotions] = await Promise.all([
    getBrand(),
    getBannerText(),
    getPromotions(),
  ]);

  const heroText = bannerTextRaw || `Welcome to ${brand.brand_name}`;

  return (
    <div className="flex flex-col gap-8">

      {/* ── Hero banner ───────────────────────────────────── */}
      <section
        className="rounded-2xl overflow-hidden relative"
        style={{
          background: `linear-gradient(135deg,
            color-mix(in srgb, var(--brand-primary) 18%, var(--bg-surface)) 0%,
            var(--bg-surface2) 100%)`,
          border: '1px solid color-mix(in srgb, var(--brand-primary) 20%, transparent)',
          boxShadow: '0 0 40px color-mix(in srgb, var(--brand-primary) 10%, transparent)',
        }}
      >
        {/* Decorative glow */}
        <div
          className="absolute top-0 right-0 w-64 h-64 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-primary) 12%, transparent) 0%, transparent 70%)',
            transform: 'translate(30%, -30%)',
          }}
        />

        <div className="relative px-6 py-10 sm:px-10 sm:py-14 text-center">
          <p
            className="text-xs font-semibold tracking-widest uppercase mb-3"
            style={{ color: 'var(--brand-primary)' }}
          >
            {brand.tagline ?? 'Your Trusted Gaming Platform'}
          </p>
          <h1
            className="text-2xl sm:text-4xl font-bold mb-4 leading-tight"
            style={{ color: 'var(--text-base)' }}
          >
            {heroText}
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
            Manage your account, claim promotions, and get support anytime.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <a href="/register" className="casino-btn-primary px-6 py-2.5 text-sm rounded-lg">
              Get Started
            </a>
            <a href="/login" className="casino-btn-outline px-6 py-2.5 text-sm rounded-lg">
              Login
            </a>
          </div>
        </div>
      </section>

      {/* ── Quick links ───────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              className="casino-card casino-card-hover p-4 flex flex-col items-center text-center gap-2 transition-all"
              style={{ textDecoration: 'none' }}
            >
              <span className="text-2xl">{link.emoji}</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-base)' }}>
                  {link.title}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {link.subtitle}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── Featured promotions ───────────────────────────── */}
      {promotions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-base)' }}>
              Featured Promotions
            </h2>
            <a
              href="/promotions"
              className="text-xs font-medium"
              style={{ color: 'var(--brand-primary)' }}
            >
              View all →
            </a>
          </div>
          <PromoBanner promotions={promotions} />
        </section>
      )}

      {/* ── Game / category cards (placeholder grid) ─────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-base)' }}>
            Popular Games
          </h2>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <GameCard title="Slots"       emoji="🎰" badge="Hot"  href="/download" />
          <GameCard title="Live Casino" emoji="🃏" badge="New"  href="/download" />
          <GameCard title="Sports"      emoji="⚽"              href="/download" />
          <GameCard title="Fishing"     emoji="🐟"              href="/download" />
        </div>
      </section>

    </div>
  );
}
