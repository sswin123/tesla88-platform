'use client';

import { useState, useCallback } from 'react';
import { isBrowser } from '@/lib/is-browser';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReferralButton {
  id:           string;
  enabled:      boolean;
  sort_order:   number;
  text:         string;
  icon:         string;
  bg_color:     string;
  text_color:   string;
  border_color: string;
  action_type:  string;
  url:          string;
  open_target:  string;
}

interface ReferralCenterConfig {
  banner_enabled?:            boolean;
  banner_desktop_media_url?:  string;
  banner_desktop_media_type?: string;
  banner_mobile_media_url?:   string;
  banner_mobile_media_type?:  string;
  banner_link_url?:           string;
  banner_link_target?:        string;
  reward_label?:              string;
  reward_amount?:             string;
  button_layout?:             string;
  buttons?:                   ReferralButton[];
  // Legacy fields (backward compat)
  title?:                     string;
  subtitle?:                  string;
  bonus_per_referral?:        string;
}

// ── Default buttons (used when config.buttons is absent / empty) ───────────────

const LEGACY_BUTTONS: ReferralButton[] = [
  { id: 'share',    enabled: true, sort_order: 0, text: 'Share',      icon: '📤', bg_color: '', text_color: '', border_color: '', action_type: 'share',             url: '',                open_target: 'self' },
  { id: 'downline', enabled: true, sort_order: 1, text: 'Downline',   icon: '👥', bg_color: '', text_color: '', border_color: '', action_type: 'open_url',          url: '/profile/invite', open_target: 'self' },
  { id: 'copy',     enabled: true, sort_order: 2, text: 'Copy Link',  icon: '🔗', bg_color: '', text_color: '', border_color: '', action_type: 'copy_referral_link', url: '',               open_target: 'self' },
  { id: 'info',     enabled: true, sort_order: 3, text: 'More Info',  icon: 'ℹ️', bg_color: '', text_color: '', border_color: '', action_type: 'open_url',          url: '/promotions',     open_target: 'self' },
];

// ── Banner ─────────────────────────────────────────────────────────────────────

function BannerMedia({ url, type }: { url: string; type: string }) {
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
      src={url} alt=""
      className="w-full h-auto block"
      style={{ maxHeight: 280, objectFit: 'cover' }}
    />
  );
}

function ReferralBanner({ config }: { config: ReferralCenterConfig }) {
  const enabled     = config.banner_enabled !== false;
  const desktopUrl  = config.banner_desktop_media_url  ?? '';
  const mobileUrl   = config.banner_mobile_media_url   ?? desktopUrl;
  const desktopType = config.banner_desktop_media_type ?? 'IMAGE';
  const mobileType  = config.banner_mobile_media_type  ?? desktopType;
  const linkUrl     = config.banner_link_url   ?? '';
  const linkTarget  = config.banner_link_target === 'blank' ? '_blank' : '_self';

  if (!enabled || !desktopUrl) return null;

  const inner = (
    <div className="relative w-full overflow-hidden rounded-xl">
      <div className="hidden sm:block">
        <BannerMedia url={desktopUrl} type={desktopType} />
      </div>
      <div className="block sm:hidden">
        <BannerMedia url={mobileUrl || desktopUrl} type={mobileType} />
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
  onAction,
  isCopied,
}: {
  btn:      ReferralButton;
  onAction: (btn: ReferralButton) => void;
  isCopied: boolean;
}) {
  const bgStyle  = btn.bg_color     ? { background: btn.bg_color }                        : { background: 'var(--brand-primary)' };
  const txtStyle = btn.text_color   ? { color: btn.text_color }                            : { color: '#fff' };
  const bdrStyle = btn.border_color ? { border: `1px solid ${btn.border_color}` }         : {};

  return (
    <button
      onClick={() => onAction(btn)}
      className="flex flex-col items-center justify-center gap-1.5 rounded-xl py-3 px-2 text-xs font-semibold w-full transition-all hover:opacity-80 active:scale-95"
      style={{ ...bgStyle, ...txtStyle, ...bdrStyle }}
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

      case 'telegram':
      case 'whatsapp':
        if (btn.url && isBrowser) window.open(btn.url, '_blank', 'noopener,noreferrer');
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
              onAction={b => { void handleAction(b); }}
              isCopied={copiedId === btn.id}
            />
          ))}
        </div>
      )}

    </section>
  );
}
