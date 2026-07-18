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

// ── Fetch referral link ────────────────────────────────────────────────────────
// Returns the full referral URL, 'guest' if not logged in, or null on other error.

async function fetchReferralLink(): Promise<string | 'guest' | null> {
  try {
    const res = await fetch('/api/member/profile', { cache: 'no-store' });
    if (res.status === 401 || res.status === 403) return 'guest';
    if (!res.ok) return null;
    const p = await res.json() as { referral_code?: string };
    if (p.referral_code && isBrowser) {
      return `${window.location.origin}/register?ref=${p.referral_code}`;
    }
    return null;
  } catch {
    return null;
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (!isBrowser) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastState { msg: string; type: 'success' | 'error' | 'info' }

function Toast({ msg, type }: ToastState) {
  const bg = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#6366f1';
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        background: bg,
        color: '#fff',
        padding: '10px 20px',
        borderRadius: 14,
        fontSize: 13,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
        zIndex: 9999,
        animation: 'rc_toastIn 0.22s ease',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span>{msg}</span>
    </div>
  );
}

// ── Login Dialog ──────────────────────────────────────────────────────────────

function LoginDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 9998,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 16px 20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          width: '100%',
          maxWidth: 360,
          padding: '24px 20px',
          animation: 'rc_slideUp 0.2s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>🔐</div>
          <p style={{ fontWeight: 700, fontSize: 16, color: '#111827', margin: '0 0 6px' }}>
            Login Required
          </p>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
            Please login to copy your referral link.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 12,
              border: '1px solid #e5e7eb', fontSize: 14,
              color: '#6b7280', background: '#fff',
              cursor: 'pointer', fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { if (isBrowser) window.location.href = '/login'; }}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 12,
              border: 'none', fontSize: 14,
              color: '#fff', background: 'var(--brand-primary)',
              cursor: 'pointer', fontWeight: 700,
            }}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}

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
      <div className="hidden lg:block">
        <BannerMedia url={desktopUrl} type={desktopType} alt={altText} />
      </div>
      <div className="hidden md:block lg:hidden">
        <BannerMedia url={tabletUrl || desktopUrl} type={tabletType} alt={altText} />
      </div>
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
  isClicked,
}: {
  btn:       ReferralButton;
  config:    ReferralCenterConfig;
  onAction:  (btn: ReferralButton) => void;
  isCopied:  boolean;
  isClicked: boolean;
}) {
  const mode = btn.button_mode ?? 'text';
  const flashAnim: React.CSSProperties = isClicked
    ? { animation: 'rc_btnFlash 0.28s ease' }
    : {};

  // Image / GIF mode: render image directly, no styled wrapper
  if ((mode === 'image' || mode === 'gif') && btn.image_media_url) {
    return (
      <button
        onClick={() => onAction(btn)}
        className="w-full block hover:opacity-80 active:scale-95"
        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', ...flashAnim }}
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
      className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 text-xs font-semibold w-full active:scale-95 overflow-hidden"
      style={{
        ...bgStyle, ...txtStyle, ...bdrStyle, ...shadowStyle, ...glowStyle,
        borderRadius: radius,
        transition: 'opacity 0.15s, transform 0.1s',
        ...flashAnim,
      }}
    >
      {btn.icon && <span className="text-xl leading-none">{btn.icon}</span>}
      <span>{isCopied ? '✓ Copied!' : btn.text}</span>
    </button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function ReferralCenterSection({ config }: { config: ReferralCenterConfig }) {
  const [copiedId,     setCopiedId]     = useState('');
  const [clickedId,    setClickedId]    = useState('');
  const [toast,        setToast]        = useState<ToastState | null>(null);
  const [showLoginDlg, setShowLoginDlg] = useState(false);

  const hasImage = !!(config.banner_desktop_media_url);

  const activeButtons = (config.buttons?.length ? config.buttons : LEGACY_BUTTONS)
    .filter(b => b.enabled !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const gridCols = config.button_layout === '4x1' ? 4
    : config.button_layout === '1x4' ? 1
    : 2;

  function showToast(msg: string, type: ToastState['type'] = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function flashBtn(id: string) {
    setClickedId(id);
    setTimeout(() => setClickedId(''), 280);
  }

  function markCopied(id: string) {
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  }

  const handleAction = useCallback(async (btn: ReferralButton) => {
    flashBtn(btn.id);
    const target = btn.open_target === 'blank' ? '_blank' : '_self';

    switch (btn.action_type) {

      // ── Share ──────────────────────────────────────────────────────────────
      case 'share': {
        const result = await fetchReferralLink();
        if (result === 'guest') {
          setShowLoginDlg(true);
          return;
        }
        // Use referral link when available, fall back to current URL
        const shareUrl = result ?? (isBrowser ? window.location.href : '');
        if (!shareUrl) return;

        if (isBrowser && navigator.share) {
          try {
            await navigator.share({ url: shareUrl, title: document.title });
            // Native share handled — no extra feedback needed
          } catch (err) {
            // AbortError = user cancelled = silent; other errors = copy fallback
            if (err instanceof Error && err.name !== 'AbortError') {
              const ok = await copyToClipboard(shareUrl);
              if (ok) {
                showToast('Referral link copied successfully.');
                markCopied(btn.id);
              }
            }
          }
        } else if (isBrowser) {
          // navigator.share not supported — copy automatically
          const ok = await copyToClipboard(shareUrl);
          if (ok) {
            showToast('Referral link copied successfully.');
            markCopied(btn.id);
          }
        }
        break;
      }

      // ── Copy referral link ─────────────────────────────────────────────────
      case 'copy_referral_link': {
        const result = await fetchReferralLink();
        if (result === 'guest') {
          setShowLoginDlg(true);
          return;
        }
        const copyUrl = result ?? (isBrowser ? window.location.href : '');
        if (!copyUrl) return;
        const ok = await copyToClipboard(copyUrl);
        if (ok) {
          showToast('Referral link copied successfully.');
          markCopied(btn.id);
        }
        break;
      }

      // ── Copy custom link (no auth check) ──────────────────────────────────
      case 'copy_link': {
        const copyUrl = btn.url || (isBrowser ? window.location.href : '');
        const ok = await copyToClipboard(copyUrl);
        if (ok) {
          showToast('Link copied successfully.');
          markCopied(btn.id);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Keyframe animations — injected once per section mount */}
      <style>{`
        @keyframes rc_toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes rc_slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rc_btnFlash {
          0%   { filter: brightness(1.5); }
          100% { filter: brightness(1); }
        }
      `}</style>

      <section className="flex flex-col gap-3">

        {/* Banner */}
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
                isClicked={clickedId === btn.id}
              />
            ))}
          </div>
        )}

      </section>

      {/* Toast notification */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Login required dialog */}
      {showLoginDlg && <LoginDialog onClose={() => setShowLoginDlg(false)} />}
    </>
  );
}
