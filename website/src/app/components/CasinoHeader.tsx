import type { PublicBrand } from '@/lib/brand';
import type { PublicAnnouncement } from '@/app/api/public/announcements/route';
import HeaderWidgets from './HeaderWidgets';
import { type HeaderConfig } from '@/lib/header-config';

export type { HeaderConfig };

interface Props {
  brand: PublicBrand;
  announcements?: PublicAnnouncement[];
  headerConfig?: HeaderConfig | null;
}

const TYPE_ICONS: Record<string, string> = {
  info: '📢', promotion: '🎁', warning: '⚠️',
};

const LOGO_SIZE_CLASS: Record<string, string> = {
  small: 'h-7', medium: 'h-10', large: 'h-13', xlarge: 'h-16',
};

function buildTickerContent(
  announcements: PublicAnnouncement[],
): React.ReactNode {
  return announcements.map((a, i) => (
    <span key={a.id} className="inline-flex items-center">
      {a.link_url ? (
        <a href={a.link_url} className="hover:underline" style={{ color: 'inherit', textDecoration: 'none' }}>
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

export default function CasinoHeader({
  brand,
  announcements = [],
  headerConfig,
}: Props) {
  const logoUrl     = brand.logo_media_id ? `/api/public/media/${brand.logo_media_id}` : null;
  const logoSizeCls = LOGO_SIZE_CLASS[brand.logo_size ?? 'medium'] ?? 'h-12';

  // Resolve config values (fall back gracefully when no config)
  const cfg = headerConfig;

  const logoAlign     = cfg?.layout === 'center-logo' ? 'center'
                      : cfg?.layout === 'right-logo'  ? 'right'
                      : (brand.logo_align ?? 'left') as 'left' | 'center' | 'right';
  const showMenuBtn   = cfg ? cfg.show_menu_button    : true;
  const showLogo      = cfg ? cfg.show_logo           : true;
  const showBrandText = cfg ? cfg.show_brand_text     : false;
  const showTicker    = cfg ? cfg.show_announcement   : true;
  const showProfile   = cfg ? (cfg.show_profile_widget ?? true) : true;
  const showWidgets   = cfg ? (cfg.show_header_widgets ?? true) : true;
  const widgets       = cfg?.widgets ?? [];

  const hasTicker = showTicker && announcements.length > 0;

  const logoEl = showLogo ? (
    <a href="/" className="flex items-center gap-2 shrink-0">
      {logoUrl ? (
        <img src={logoUrl} alt={brand.brand_name} className={`${logoSizeCls} w-auto object-contain`} />
      ) : (
        <span className="font-bold text-xl tracking-wide glow-text" style={{ color: 'var(--brand-primary)' }}>
          {brand.brand_name}
        </span>
      )}
      {showBrandText && logoUrl && (
        <span className="font-bold text-base hidden sm:inline" style={{ color: 'var(--text-base)' }}>
          {brand.brand_name}
        </span>
      )}
    </a>
  ) : null;

  const menuBtn = showMenuBtn ? (
    <button className="lg:hidden flex flex-col gap-1.5 p-1 shrink-0" aria-label="Menu">
      <span className="block w-5 h-px bg-white/70" />
      <span className="block w-5 h-px bg-white/70" />
      <span className="block w-5 h-px bg-white/70" />
    </button>
  ) : null;

  // When headerConfig exists, HeaderWidgets is the single source of truth.
  // Legacy fallback only renders when NO config has been saved at all.
  const widgetsEl = cfg ? (
    <HeaderWidgets widgets={widgets} showProfile={showProfile} showWidgets={showWidgets} />
  ) : (
    <div className="flex items-center gap-1">
      <button className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm casino-btn-outline"
        style={{ color: 'var(--text-muted)' }} aria-label="语言选择">
        <span>🌐</span><span>中文</span>
      </button>
      <a href="/profile" className="flex lg:hidden p-1.5 rounded-full" style={{ color: 'var(--text-muted)' }} aria-label="个人中心">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </a>
    </div>
  );

  return (
    <>
      {/* ── Main header bar ──────────────────────────────────── */}
      <header
        className="fixed top-0 inset-x-0 z-50 flex items-end"
        style={{
          height: 'calc(var(--header-h) + env(safe-area-inset-top, 0px))',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 98%, transparent) 0%, color-mix(in srgb, var(--bg-elevated) 92%, transparent) 100%)',
          borderBottom: '1px solid var(--border-dim)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Centered layout uses relative container for absolute logo centering */}
        {logoAlign === 'center' ? (
          <div className="w-full max-w-7xl mx-auto px-3 relative flex items-center h-full">
            {/* Left: menu button only */}
            <div className="flex items-center gap-2 z-10">
              {menuBtn}
            </div>
            {/* Center: logo — absolutely centered regardless of widget count */}
            <div className="absolute left-1/2 -translate-x-1/2 z-10">
              {logoEl}
            </div>
            {/* Right: widgets */}
            <div className="ml-auto flex items-center z-10">
              {widgetsEl}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-7xl mx-auto px-3 flex items-center gap-3">
            {menuBtn}
            {logoAlign === 'left' && (
              <>
                {logoEl}
                <div className="flex-1" />
                {widgetsEl}
              </>
            )}
            {logoAlign === 'right' && (
              <>
                <div className="flex-1 flex">
                  {widgetsEl}
                </div>
                {logoEl}
              </>
            )}
            {/* Fallback (no config, no logo align set) */}
            {logoAlign !== 'left' && logoAlign !== 'right' && (
              <>
                {logoEl}
                <div className="flex-1" />
                {widgetsEl}
              </>
            )}
          </div>
        )}
      </header>

      {/* ── Announcement ticker ──────────────────────────────── */}
      {hasTicker && (
        <div className="fixed z-40 inset-x-0 overflow-hidden flex items-center"
          style={{
            top: 'calc(var(--header-h) + env(safe-area-inset-top, 0px))',
            height: 'var(--ticker-h)',
            background: 'color-mix(in srgb, var(--bg-base) 85%, transparent)',
            borderBottom: '1px solid var(--border-dim)',
          }}>
          <div className="ticker-track text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="mr-16 inline-flex items-center gap-0">
              {buildTickerContent(announcements)}
            </span>
            <span className="mr-16 inline-flex items-center gap-0" aria-hidden>
              {buildTickerContent(announcements)}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
