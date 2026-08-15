'use client';
import { usePathname } from 'next/navigation';
import type { FooterConfig, FooterDefaultIconKey } from '@/lib/footer-config';

const TABS = [
  {
    label: '首页',
    href: '/',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M3 12L12 3l9 9" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    label: '记录',
    href: '/history',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
  {
    label: '优惠',
    href: '/promotions',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
      </svg>
    ),
  },
  {
    label: '客服',
    href: '/chat',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    label: '我的',
    href: '/profile',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
];

// Built-in icon set — used both as the classic hardcoded fallback (no
// footerConfig at all) and per-item when a custom item has no uploaded
// icon_media_id (default_icon_key !== 'custom').
const DEFAULT_ICONS: Record<Exclude<FooterDefaultIconKey, 'custom'>, React.ReactNode> = {
  home: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 12L12 3l9 9" />
      <path d="M9 21V12h6v9" />
    </svg>
  ),
  history: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  promotion: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  ),
  chat: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  profile: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
};

const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  classic: {},
  glass: { backdropFilter: 'blur(16px)', background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)' },
  solid: { backdropFilter: 'none', background: 'var(--bg-elevated)' },
  gradient: { background: 'linear-gradient(180deg, transparent, var(--bg-elevated) 40%)' },
};

export default function BottomNav({ footerConfig }: { footerConfig?: FooterConfig | null }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  // No published custom config — keep the exact original hardcoded markup,
  // byte-for-byte, so upgrading Footer Builder can never break the site.
  if (!footerConfig || footerConfig.items.length === 0) {
    return (
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 flex items-start"
        style={{
          height: 'calc(var(--bottomnav-h) + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'color-mix(in srgb, var(--bg-elevated) 97%, transparent)',
          borderTop: '1px solid var(--border-dim)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {TABS.map(tab => {
          const active = isActive(tab.href);
          return (
            <a
              key={tab.href}
              href={tab.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{
                color: active ? 'var(--brand-primary)' : 'var(--text-faint)',
                textDecoration: 'none',
              }}
            >
              <span
                style={
                  active
                    ? {
                        filter: `drop-shadow(0 0 6px color-mix(in srgb, var(--brand-primary) 60%, transparent))`,
                      }
                    : undefined
                }
              >
                {tab.icon}
              </span>
              <span
                className="text-xs font-medium"
                style={{ fontSize: '10px', letterSpacing: '0.02em' }}
              >
                {tab.label}
              </span>
              {active && (
                <span
                  className="absolute bottom-0 rounded-t-full"
                  style={{
                    width: '32px',
                    height: '3px',
                    background: 'var(--brand-primary)',
                    boxShadow: '0 0 8px var(--brand-primary)',
                  }}
                />
              )}
            </a>
          );
        })}
      </nav>
    );
  }

  const style = footerConfig.style ?? {};
  const iconSize = style.icon_size ?? 19;
  const textSize = style.text_size ?? 10;
  const items = [...footerConfig.items]
    .filter(item => item.enabled)
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 6);

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 flex items-start"
      style={{
        height: style.height ? `${style.height}px` : 'calc(var(--bottomnav-h) + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: style.background || 'color-mix(in srgb, var(--bg-elevated) 97%, transparent)',
        borderTop: style.border === false ? 'none' : '1px solid var(--border-dim)',
        backdropFilter: 'blur(12px)',
        opacity: style.opacity ?? 1,
        ...VARIANT_STYLES[style.variant ?? 'classic'],
      }}
    >
      {items.map(item => {
        const active = item.link_type === 'internal' && isActive(item.route);
        const iconMediaId = active && item.active_icon_media_id ? item.active_icon_media_id : item.icon_media_id;
        const linkProps = item.link_type === 'external'
          ? { target: item.open_in_new_tab ? '_blank' : undefined, rel: 'noopener noreferrer' }
          : {};

        return (
          <a
            key={item.id}
            href={item.route}
            {...linkProps}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
            style={{
              color: active ? 'var(--brand-primary)' : 'var(--text-faint)',
              textDecoration: 'none',
            }}
          >
            <span
              style={
                active
                  ? { filter: `drop-shadow(0 0 6px color-mix(in srgb, var(--brand-primary) 60%, transparent))` }
                  : undefined
              }
            >
              {iconMediaId ? (
                // eslint-disable-next-line @next/next/no-img-element -- plain <img> preserves animated GIF playback
                <img
                  src={`/api/public/media/${iconMediaId}`}
                  alt={item.label}
                  width={iconSize}
                  height={iconSize}
                  style={{ width: iconSize, height: iconSize, objectFit: 'contain' }}
                />
              ) : item.default_icon_key !== 'custom' ? (
                DEFAULT_ICONS[item.default_icon_key]
              ) : null}
            </span>
            <span
              className="text-xs font-medium"
              style={{ fontSize: `${textSize}px`, letterSpacing: '0.02em' }}
            >
              {item.label}
            </span>
            {active && (
              <span
                className="absolute bottom-0 rounded-t-full"
                style={{
                  width: '32px',
                  height: '3px',
                  background: 'var(--brand-primary)',
                  boxShadow: '0 0 8px var(--brand-primary)',
                }}
              />
            )}
          </a>
        );
      })}
    </nav>
  );
}
