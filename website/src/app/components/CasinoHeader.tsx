import type { PublicBrand } from '@/lib/brand';
import type { PublicAnnouncement } from '@/app/api/public/announcements/route';

interface Props {
  brand: PublicBrand;
  /** ERP-managed announcements (priority) */
  announcements?: PublicAnnouncement[];
  /** Legacy fallback from system_settings site_banner_text */
  fallbackBannerText?: string;
}

const TYPE_ICONS: Record<string, string> = {
  info:      '📢',
  promotion: '🎁',
  warning:   '⚠️',
};

const NAV_LINKS = [
  { label: '首页',     href: '/' },
  { label: '优惠活动', href: '/promotions' },
  { label: '下载APP',  href: '/download' },
  { label: '在线客服', href: '/chat' },
];

function buildTickerContent(
  announcements: PublicAnnouncement[],
  fallback: string
): React.ReactNode {
  if (announcements.length > 0) {
    return announcements.map((a, i) => (
      <span key={a.id} className="inline-flex items-center">
        {a.link_url ? (
          <a
            href={a.link_url}
            className="hover:underline"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            {TYPE_ICONS[a.type] ?? '📢'}&nbsp;{a.title}：{a.message}
          </a>
        ) : (
          <span>{TYPE_ICONS[a.type] ?? '📢'}&nbsp;{a.title}：{a.message}</span>
        )}
        {i < announcements.length - 1 && (
          <span className="mx-10 opacity-30 select-none">◆</span>
        )}
      </span>
    ));
  }
  return <span>📢&nbsp;{fallback}</span>;
}

export default function CasinoHeader({ brand, announcements = [], fallbackBannerText = '' }: Props) {
  const logoUrl = brand.logo_media_id
    ? `/api/public/media/${brand.logo_media_id}`
    : null;

  const hasTicker = announcements.length > 0 || !!fallbackBannerText;

  return (
    <>
      {/* ── Main header bar ──────────────────────────────────── */}
      <header
        className="fixed top-0 inset-x-0 z-50 flex items-center"
        style={{
          height: 'var(--header-h)',
          background: 'linear-gradient(180deg, rgba(10,11,20,0.98) 0%, rgba(10,11,20,0.92) 100%)',
          borderBottom: '1px solid rgba(255 255 255 / 0.06)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="w-full max-w-7xl mx-auto px-4 flex items-center gap-4">

          {/* Mobile hamburger (placeholder) */}
          <button
            className="lg:hidden flex flex-col gap-1.5 p-1 shrink-0"
            aria-label="Menu"
          >
            <span className="block w-5 h-px bg-white/70" />
            <span className="block w-5 h-px bg-white/70" />
            <span className="block w-5 h-px bg-white/70" />
          </button>

          {/* Logo */}
          <a href="/" className="flex items-center gap-2 shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt={brand.brand_name} className="h-8 w-auto" />
            ) : (
              <span
                className="font-bold text-xl tracking-wide glow-text"
                style={{ color: 'var(--brand-primary)' }}
              >
                {brand.brand_name}
              </span>
            )}
          </a>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1 ml-6">
            {NAV_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => {
                  (e.target as HTMLAnchorElement).style.color = 'var(--text-base)';
                  (e.target as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.05)';
                }}
                onMouseLeave={e => {
                  (e.target as HTMLAnchorElement).style.color = 'var(--text-muted)';
                  (e.target as HTMLAnchorElement).style.background = '';
                }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Language selector placeholder */}
          <button
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm casino-btn-outline"
            style={{ color: 'var(--text-muted)' }}
            aria-label="语言选择"
          >
            <span>🌐</span>
            <span>中文</span>
          </button>

          {/* Mobile: profile icon */}
          <a
            href="/profile"
            className="lg:hidden p-1.5 rounded-full"
            style={{ color: 'var(--text-muted)' }}
            aria-label="个人中心"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </a>
        </div>
      </header>

      {/* ── Announcement ticker ──────────────────────────────── */}
      {hasTicker && (
        <div
          className="fixed z-40 inset-x-0 overflow-hidden flex items-center"
          style={{
            top: 'var(--header-h)',
            height: 'var(--ticker-h)',
            background: 'rgba(0,0,0,0.6)',
            borderBottom: '1px solid rgba(255 255 255 / 0.05)',
          }}
        >
          {/* Duplicate content for seamless infinite scroll (translateX(-50%) animation) */}
          <div className="ticker-track text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="mr-16 inline-flex items-center gap-0">
              {buildTickerContent(announcements, fallbackBannerText)}
            </span>
            <span className="mr-16 inline-flex items-center gap-0" aria-hidden>
              {buildTickerContent(announcements, fallbackBannerText)}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
