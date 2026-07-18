'use client';

import { useState, useCallback } from 'react';
import { isBrowser } from '@/lib/is-browser';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReferralButton {
  id:              string;
  enabled:         boolean;
  sort_order:      number;
  text:            string;
  icon:            string;
  button_mode?:    'text' | 'image' | 'gif';
  image_media_id?: number | null;
  image_media_url?: string;
  bg_color:        string;
  text_color:      string;
  border_color:    string;
  action_type:     string;
  url:             string;
  open_target:     string;
}

interface ReferralCenterConfig {
  banner_enabled?:             boolean;
  banner_desktop_media_url?:   string;
  banner_desktop_media_type?:  string;
  banner_desktop_alt?:         string;
  banner_tablet_media_url?:    string;
  banner_tablet_media_type?:   string;
  banner_mobile_media_url?:    string;
  banner_mobile_media_type?:   string;
  banner_link_url?:            string;
  banner_link_target?:         string;
  reward_label?:               string;
  reward_amount?:              string;
  button_layout?:              string;
  button_border_radius?:       string;
  button_shadow?:              boolean;
  button_glow?:                boolean;
  buttons?:                    ReferralButton[];
  // Legacy fields (backward compat)
  title?:                      string;
  subtitle?:                   string;
  bonus_per_referral?:         string;
}

// ── Default buttons (used when config.buttons is absent / empty) ───────────────

const LEGACY_BUTTONS: ReferralButton[] = [
  { id: 'share',    enabled: true, sort_order: 0, text: 'Share',      icon: '📤', button_mode: 'text', bg_color: '', text_color: '', border_color: '', action_type: 'share',             url: '',                open_target: 'self' },
  { id: 'downline', enabled: true, sort_order: 1, text: 'Downline',   icon: '👥', button_mode: 'text', bg_color: '', text_color: '', border_color: '', action_type: 'open_downline',     url: '',                open_target: 'self' },
  { id: 'copy',     enabled: true, sort_order: 2, text: 'Copy Link',  icon: '🔗', button_mode: 'text', bg_color: '', text_color: '', border_color: '', action_type: 'copy_referral_link', url: '',               open_target: 'self' },
  { id: 'info',     enabled: true, sort_order: 3, text: 'More Info',  icon: 'ℹ️', button_mode: 'text', bg_color: '', text_color: '', border_color: '', action_type: 'open_url',          url: '/promotions',     open_target: 'self' },
];

// ── Banner ─────────────────────────────────────────────────────────────────────

function BannerMedia({ url, type, alt = '' }: { url: string; type: string; alt?: string }) {
  if (type === 'VIDEO') {
    return (
      <video
        src={url} autoPlay muted loop playsInline
        className="w-full h-auto block"
        style={{ maxHeight: 280, objectFit: 'cover' }}
      />
    );
  }
  return (
    <img
      src={url} alt={alt}
      className="w-full h-auto block"
      style={{ maxHeight: 280, objectFit: 'cover' }}
    />
  );
}

function ReferralBanner({ config }: { config: ReferralCenterConfig }) {
  const enabled     = config.banner_enabled !== false;
  const desktopUrl  = config.banner_desktop_media_url  ?? '';
  const tabletUrl   = config.banner_tablet_media_url   ?? desktopUrl;
  const mobileUrl   = config.banner_mobile_media_url   ?? desktopUrl;
  const desktopType = config.banner_desktop_media_type ?? 'IMAGE';
  const tabletType  = config.banner_tablet_media_type  ?? desktopType;
  const mobileType  = config.banner_mobile_media_type  ?? desktopType;
  const altText     = config.banner_desktop_alt        ?? '';
  const linkUrl     = config.banner_link_url           ?? '';
  const linkTarget  = config.banner_link_target === 'blank' ? '_blank' : '_self';

  if (!enabled || !desktopUrl) return null;

  const inner = (
    <div className="relative w-full overflow-hidden rounded-xl">
      {/* Desktop ≥ 1024px */}
      <div className="hidden lg:block">
        <BannerMedia url={desktopUrl} type={desktopType} alt={altText} />
      </div>
      {/* Tablet 768–1023px */}
      <div className="hidden md:block lg:hidden">
        <BannerMedia url={tabletUrl || desktopUrl} type={tabletType} alt={altText} />
      </div>
      {/* Mobile < 768px */}
      <div className="block md:hidden">
        <BannerMedia url={mobileUrl || desktopUrl} type={mobileType} alt={altText} />
      </div>
    </div>
  );

  if (linkUrl) {
    return (
      <a href={linkUrl} target={linkTarget} rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }
  return inner;
}

// ── No-image fallback banner ───────────────────────────────────────────────────

function FallbackBanner({ config }: { config: ReferralCenterConfig }) {
  const title   = config.title        ?? 'Referral Center';
  const subtitle = config.subtitle    ?? 'Refer friends and earn rewards';
  const label   = config.reward_label ?? 'Reward';
  const amount  = config.reward_amount ?? config.bonus_per_referral ?? 'RM 50';

  return (
    <div
      className="rounded-xl p-4 flex items-center gap-4"
      style={{ background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))' }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.15)' }}
      >
        🎁
      </div>
      <div className="min-w-0">
        <p className="font-bold text-white text-sm leading-none">{title}</p>
        <p className="text-xs text-white/70 mt-0.5">{subtitle}</p>
        <p className="text-base font-black text-white mt-1">{label}: {amount}</p>
      </div>
    </div>
  );
}

// ── Single action button ───────────────────────────────────────────────────────

function ActionButton({
  btn,
  config,
  onAction,
  isCopied,
}: {
  btn:      ReferralButton;
  config:   ReferralCenterConfig;
  onAction: (btn: ReferralButton) => void;
  isCopied: boolean;
}) {
  const mode = btn.button_mode ?? 'text';

  // Image / GIF mode: render image directly, no styled wrapper
  if ((mode === 'image' || mode === 'gif') && btn.image_media_url) {
    return (
      <button
        onClick={() => onAction(btn)}
        className="w-full block transition-all hover:opacity-80 active:scale-95"
        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
        aria-label={btn.text}
      >
        <img
          src={btn.image_media_url}
          alt={btn.text}
          className="w-full h-auto block max-w-full"
          style={{ display: 'block', borderRadius: config.button_border_radius ? `${config.button_border_radius}px` : 0 }}
        />
      </button>
    );
  }

  // Text mode (default)
  const radius = config.button_border_radius ? `${config.button_border_radius}px` : '12px';
  const hasBgImg = !!(btn as ReferralButton & { bg_media_url?: string }).bg_media_url;
  const bgImgUrl = hasBgImg ? (btn as ReferralButton & { bg_media_url: string }).bg_media_url : '';

  const bgStyle: React.CSSProperties = hasBgImg
    ? { backgroundImage: `url(${bgImgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : btn.bg_color
      ? { background: btn.bg_color }
      : { background: 'var(--brand-primary)' };

  const txtStyle = btn.text_color ? { color: btn.text_color } : { color: '#fff' };
  const bdrStyle = btn.border_color ? { border: `1px solid ${btn.border_color}` } : {};

  const shadowStyle: React.CSSProperties = config.button_shadow
    ? { boxShadow: '0 4px 12px rgba(0,0,0,0.25)' } : {};
  const glowStyle: React.CSSProperties  = config.button_glow
    ? { boxShadow: '0 0 12px var(--brand-primary)' } : {};

  return (
    <button
      onClick={() => onAction(btn)}
      className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 text-xs font-semibold w-full transition-all hover:opacity-80 active:scale-95 overflow-hidden"
      style={{ ...bgStyle, ...txtStyle, ...bdrStyle, ...shadowStyle, ...glowStyle, borderRadius: radius }}
    >
      {btn.icon && <span className="text-xl leading-none">{btn.icon}</span>}
      <span>{isCopied ? '✓ Copied!' : btn.text}</span>
    </button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function ReferralCenterSection({ config }: { config: ReferralCenterConfig }) {
  const [copiedId, setCopiedId] = useState('');

  const hasImage = !!(config.banner_desktop_media_url);

  const activeButtons = (config.buttons?.length ? config.buttons : LEGACY_BUTTONS)
    .filter(b => b.enabled !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const gridCols = config.button_layout === '4x1' ? 4
    : config.button_layout === '1x4' ? 1
    : 2; // default 2×2

  const handleAction = useCallback(async (btn: ReferralButton) => {
    const target = btn.open_target === 'blank' ? '_blank' : '_self';

    switch (btn.action_type) {

      case 'share': {
        const shareUrl = btn.url || (isBrowser ? window.location.href : '');
        if (isBrowser && navigator.share) {
          try {
            await navigator.share({ url: shareUrl, title: document.title });
          } catch {
            navigator.clipboard.writeText(shareUrl).catch(() => {});
          }
        } else if (isBrowser) {
          navigator.clipboard.writeText(shareUrl).catch(() => {});
        }
        break;
      }

      case 'copy_referral_link':
      case 'copy_link': {
        let copyUrl = btn.url || (isBrowser ? window.location.href : '');
        if (btn.action_type === 'copy_referral_link' && isBrowser) {
          try {
            const res = await fetch('/api/member/profile', { cache: 'no-store' });
            if (res.ok) {
              const p = await res.json() as { referral_code?: string };
              if (p.referral_code) {
                copyUrl = `${window.location.origin}/register?ref=${p.referral_code}`;
              }
            }
          } catch { /* stay with page URL */ }
        }
        if (isBrowser) {
          navigator.clipboard.writeText(copyUrl).then(() => {
            setCopiedId(btn.id);
            setTimeout(() => setCopiedId(''), 2000);
          }).catch(() => {});
        }
        break;
      }

      case 'register':
        if (isBrowser) window.open('/register', target);
        break;

      case 'deposit':
        if (isBrowser) window.open('/deposit', target);
        break;

      case 'open_downline':
        if (isBrowser) window.open('/profile/invite', target);
        break;

      case 'open_external_url':
        if (btn.url && isBrowser) window.open(btn.url, '_blank', 'noopener,noreferrer');
        break;

      case 'telegram':
      case 'whatsapp':
        if (btn.url && isBrowser) window.open(btn.url, '_blank', 'noopener,noreferrer');
        break;

      case 'open_popup':
        if (btn.url && isBrowser) window.open(btn.url, '_blank', 'noopener,noreferrer,width=480,height=640');
        break;

      case 'none':
        break;

      case 'open_url':
      case 'internal_page':
      default:
        if (btn.url && isBrowser) window.open(btn.url, target);
        break;
    }
  }, []);

  return (
    <section className="flex flex-col gap-3">

      {/* Banner: real image or fallback gradient */}
      {hasImage
        ? <ReferralBanner config={config} />
        : <FallbackBanner config={config} />
      }

      {/* Action buttons grid */}
      {activeButtons.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gap: 8,
          }}
        >
          {activeButtons.map(btn => (
            <ActionButton
              key={btn.id}
              btn={btn}
              config={config}
              onAction={b => { void handleAction(b); }}
              isCopied={copiedId === btn.id}
            />
          ))}
        </div>
      )}

    </section>
  );
}
