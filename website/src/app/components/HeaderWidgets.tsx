'use client';
import { useState, useRef, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type SocialPlatform =
  | 'whatsapp' | 'telegram' | 'facebook' | 'instagram'
  | 'tiktok' | 'youtube' | 'discord' | 'line' | 'x' | 'custom';

export type OpenMode      = 'same' | 'new' | 'popup';
export type Visibility    = 'both' | 'desktop' | 'mobile';
export type ButtonVariant = 'primary' | 'outline' | 'ghost';
export type BadgeLabel    = 'NEW' | 'HOT' | 'VIP' | 'LIVE' | '';
export type ProfileAction = 'profile' | 'login' | 'custom';

export interface SocialSettings {
  platform: SocialPlatform;
  url: string;
  label?: string;
  open: OpenMode;
}

export interface ButtonSettings {
  text: string;
  url: string;
  open: OpenMode;
  variant: ButtonVariant;
  badge: BadgeLabel;
  icon?: string;
}

export interface LanguageSettings {
  languages: Array<{ code: string; label: string; flag: string }>;
}

export interface PartnerItem {
  id: string;
  name: string;
  logo_media_id?: number;
  logo_url?: string;
  url: string;
  open: OpenMode;
  popup_title?: string;
  popup_description?: string;
  popup_whatsapp?: string;
  popup_telegram?: string;
  popup_facebook?: string;
  popup_instagram?: string;
  popup_youtube?: string;
}

export interface PartnerSettings {
  partners: PartnerItem[];
  display_type: 'single' | 'carousel' | 'list';
  display_style: 'image_only' | 'image_text' | 'text_only';
  logo_size: 'small' | 'medium' | 'large' | 'xlarge';
  shape: 'square' | 'rounded' | 'circle';
  hover_effect: 'none' | 'scale' | 'glow' | 'pulse';
  bg_style: 'transparent' | 'glass' | 'solid' | 'outline' | 'pill';
  badge: string;
}

export interface ProfileSettings {
  action: ProfileAction;
  custom_url?: string;
  custom_icon?: string;
  tooltip?: string;
}

export type WidgetType = 'social' | 'button' | 'language' | 'partner' | 'profile' | 'divider';

export interface HeaderWidget {
  id: string;
  type: WidgetType;
  enabled: boolean;
  visibility: Visibility;
  settings: SocialSettings | ButtonSettings | LanguageSettings | PartnerSettings | ProfileSettings | Record<string, never>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SOCIAL_ICONS: Record<SocialPlatform, string> = {
  whatsapp: '📱', telegram: '✈️', facebook: '👤', instagram: '📸',
  tiktok: '🎵', youtube: '▶️', discord: '🎮', line: '💬',
  x: '𝕏', custom: '🔗',
};

const LOGO_SIZE_PX: Record<string, number> = {
  small: 20, medium: 28, large: 36, xlarge: 44,
};

const SHAPE_CLASS: Record<string, string> = {
  square: 'rounded-none', rounded: 'rounded-lg', circle: 'rounded-full',
};

const BADGE_COLORS: Record<string, string> = {
  NEW: '#22c55e', HOT: '#ef4444', VIP: '#f59e0b', LIVE: '#a855f7',
  Official: '#3b82f6', Sponsor: '#8b5cf6', Partner: '#06b6d4',
};

function visClass(v: Visibility): string {
  if (v === 'desktop') return 'hidden lg:flex';
  if (v === 'mobile')  return 'flex lg:hidden';
  return 'flex';
}

// ── Social Widget ──────────────────────────────────────────────────────────────

function SocialWidget({ w }: { w: HeaderWidget }) {
  const s = w.settings as SocialSettings;
  return (
    <a href={s.url || '#'}
      target={s.open === 'same' ? '_self' : '_blank'}
      rel="noopener noreferrer"
      onClick={e => { if (s.open === 'popup') { e.preventDefault(); window.open(s.url, '_blank', 'width=520,height=600'); } }}
      className={`items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/10 ${visClass(w.visibility)}`}
      style={{ color: 'var(--text-muted)' }}
      aria-label={s.label || s.platform}>
      <span className="text-base leading-none">{SOCIAL_ICONS[s.platform] ?? '🔗'}</span>
      {s.label && <span className="hidden xl:inline text-xs font-medium">{s.label}</span>}
    </a>
  );
}

// ── Language Dropdown ──────────────────────────────────────────────────────────

function LanguageWidget({ w }: { w: HeaderWidget }) {
  const s = w.settings as LanguageSettings;
  const langs = s.languages ?? [];
  const [open, setOpen]       = useState(false);
  const [current, setCurrent] = useState(langs[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!langs.length) return null;

  return (
    <div ref={ref} className={`relative ${w.visibility === 'desktop' ? 'hidden lg:block' : w.visibility === 'mobile' ? 'block lg:hidden' : 'block'}`}>
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-white/15 hover:border-white/30 transition-colors"
        style={{ color: 'var(--text-muted)' }}>
        <span>{current?.flag ?? '🌐'}</span>
        <span className="hidden sm:inline">{current?.label ?? 'EN'}</span>
        <span className="text-[10px] text-white/40">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-[120px] rounded-xl overflow-hidden shadow-xl z-50 py-1"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)' }}>
          {langs.map(l => (
            <button key={l.code} onClick={() => { setCurrent(l); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 transition-colors text-left"
              style={{ color: l.code === current?.code ? 'var(--brand-primary)' : 'var(--text-muted)' }}>
              <span>{l.flag}</span><span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Button Widget ──────────────────────────────────────────────────────────────

function ButtonWidget({ w }: { w: HeaderWidget }) {
  const s = w.settings as ButtonSettings;
  return (
    <div className={`relative shrink-0 ${w.visibility === 'desktop' ? 'hidden lg:block' : w.visibility === 'mobile' ? 'block lg:hidden' : 'block'}`}>
      <a href={s.url || '#'} target={s.open === 'new' ? '_blank' : '_self'} rel="noopener noreferrer"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          s.variant === 'primary' ? 'bg-[var(--brand-primary)] text-white hover:opacity-90' :
          s.variant === 'outline' ? 'border border-white/25 text-white/80 hover:bg-white/10' :
          'text-white/70 hover:text-white hover:bg-white/10'
        }`}>
        {s.icon && <span className="text-sm leading-none">{s.icon}</span>}
        <span>{s.text}</span>
      </a>
      {s.badge && (
        <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold px-1 py-0.5 rounded-full text-white leading-none"
          style={{ background: BADGE_COLORS[s.badge] ?? '#ef4444' }}>
          {s.badge}
        </span>
      )}
    </div>
  );
}

// ── Partner Popup ──────────────────────────────────────────────────────────────

function PartnerPopup({ item, onClose }: { item: PartnerItem; onClose: () => void }) {
  const logoUrl = item.logo_media_id ? `/api/public/media/${item.logo_media_id}` : item.logo_url;
  const socials = [
    { url: item.popup_whatsapp,  label: 'WhatsApp',  color: '#25D366', icon: '📱' },
    { url: item.popup_telegram,  label: 'Telegram',  color: '#2AABEE', icon: '✈️' },
    { url: item.popup_facebook,  label: 'Facebook',  color: '#1877F2', icon: '👤' },
    { url: item.popup_instagram, label: 'Instagram', color: '#E4405F', icon: '📸' },
    { url: item.popup_youtube,   label: 'YouTube',   color: '#FF0000', icon: '▶️' },
  ].filter(s => s.url);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)' }}>
        <div className="p-5">
          {logoUrl
            ? <img src={logoUrl} alt={item.name} className="h-14 w-auto object-contain mx-auto mb-3" />
            : <div className="text-3xl text-center mb-3">🤝</div>
          }
          <h3 className="text-base font-bold text-center mb-1" style={{ color: 'var(--text-base)' }}>
            {item.popup_title || item.name}
          </h3>
          {item.popup_description && (
            <p className="text-xs text-center mb-4" style={{ color: 'var(--text-muted)' }}>{item.popup_description}</p>
          )}
          <div className="flex flex-col gap-2">
            {socials.map(sc => (
              <a key={sc.label} href={sc.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: sc.color }}>
                {sc.icon} {sc.label}
              </a>
            ))}
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border"
                style={{ borderColor: 'var(--border-mid)', color: 'var(--text-muted)' }}>
                🌐 访问官网
              </a>
            )}
          </div>
        </div>
        <button onClick={onClose} className="w-full py-3 text-xs border-t font-medium hover:bg-white/5 transition-colors"
          style={{ borderColor: 'var(--border-dim)', color: 'var(--text-faint)' }}>
          关闭
        </button>
      </div>
    </div>
  );
}

// ── Partner Widget ─────────────────────────────────────────────────────────────

function PartnerWidget({ w }: { w: HeaderWidget }) {
  const s = w.settings as PartnerSettings;
  const partners = s.partners ?? [];
  const [popupItem, setPopupItem] = useState<PartnerItem | null>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);

  // Carousel auto-advance
  useEffect(() => {
    if (s.display_type !== 'carousel' || partners.length <= 1) return;
    const t = setInterval(() => setCarouselIdx(i => (i + 1) % partners.length), 3500);
    return () => clearInterval(t);
  }, [s.display_type, partners.length]);

  if (!partners.length) return null;

  const sz   = LOGO_SIZE_PX[s.logo_size ?? 'medium'];
  const shapeClass = SHAPE_CLASS[s.shape ?? 'rounded'];

  const hoverClass =
    s.hover_effect === 'scale' ? 'hover:scale-110 transition-transform' :
    s.hover_effect === 'glow'  ? 'hover:drop-shadow-lg transition-all' :
    s.hover_effect === 'pulse' ? 'hover:animate-pulse' : '';

  const bgClass =
    s.bg_style === 'glass'   ? 'bg-white/10 backdrop-blur' :
    s.bg_style === 'solid'   ? 'bg-white/20' :
    s.bg_style === 'outline' ? 'border border-white/20' :
    s.bg_style === 'pill'    ? 'bg-white/10 rounded-full px-2' : '';

  const visibilityClass = w.visibility === 'desktop' ? 'hidden lg:flex' : w.visibility === 'mobile' ? 'flex lg:hidden' : 'flex';

  const displayPartners = s.display_type === 'carousel' ? [partners[carouselIdx]] : partners;

  function renderPartnerItem(item: PartnerItem) {
    const logoUrl = item.logo_media_id ? `/api/public/media/${item.logo_media_id}` : item.logo_url;
    const showLogo = logoUrl && s.display_style !== 'text_only';
    const showText = s.display_style !== 'image_only' || !logoUrl;

    function handleClick() {
      if (item.open === 'popup') setPopupItem(item);
      else if (item.url) {
        if (item.open === 'new') window.open(item.url, '_blank', 'noopener,noreferrer');
        else window.location.href = item.url;
      }
    }

    return (
      <button key={item.id} type="button" onClick={handleClick}
        className={`flex items-center gap-1.5 ${bgClass} ${hoverClass} transition-all relative`}
        style={{ color: 'var(--text-muted)' }}
        title={item.name}>
        {showLogo && (
          <img src={logoUrl!} alt={item.name} className={`object-contain ${shapeClass}`}
            style={{ height: sz, width: 'auto', maxWidth: sz * 3 }} />
        )}
        {showText && (
          <span className="text-xs font-medium hidden sm:inline">{item.name}</span>
        )}
        {s.badge && s.badge !== '' && (
          <span className="absolute -top-1.5 -right-1.5 text-[7px] font-bold px-0.5 py-px rounded-full text-white leading-none"
            style={{ background: BADGE_COLORS[s.badge] ?? '#8b5cf6' }}>
            {s.badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      <div className={`items-center gap-1.5 ${visibilityClass}`}>
        {displayPartners.map(item => renderPartnerItem(item))}
      </div>
      {popupItem && <PartnerPopup item={popupItem} onClose={() => setPopupItem(null)} />}
    </>
  );
}

// ── Profile Widget ─────────────────────────────────────────────────────────────

function ProfileWidget({ w }: { w: HeaderWidget }) {
  const s = w.settings as ProfileSettings;
  const href =
    s.action === 'profile' ? '/profile' :
    s.action === 'login'   ? '/login' :
    (s.custom_url || '/profile');

  return (
    <a href={href}
      className={`items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-white/10 ${visClass(w.visibility)}`}
      style={{ color: 'var(--text-muted)' }}
      aria-label={s.tooltip || '个人中心'}
      title={s.tooltip || '个人中心'}>
      {s.custom_icon ? (
        <span className="text-base leading-none">{s.custom_icon}</span>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      )}
    </a>
  );
}

// ── Widget Router ──────────────────────────────────────────────────────────────

function Widget({ w }: { w: HeaderWidget }) {
  if (!w.enabled) return null;
  if (w.type === 'divider') {
    return (
      <div className={`w-px h-5 mx-1 shrink-0 ${w.visibility === 'desktop' ? 'hidden lg:block' : w.visibility === 'mobile' ? 'block lg:hidden' : 'block'}`}
        style={{ background: 'var(--border-mid)' }} />
    );
  }
  if (w.type === 'social')   return <SocialWidget   w={w} />;
  if (w.type === 'language') return <LanguageWidget w={w} />;
  if (w.type === 'button')   return <ButtonWidget   w={w} />;
  if (w.type === 'partner')  return <PartnerWidget  w={w} />;
  if (w.type === 'profile')  return <ProfileWidget  w={w} />;
  return null;
}

// ── Main Export ────────────────────────────────────────────────────────────────

export default function HeaderWidgets({
  widgets,
  showProfile = true,
  showWidgets = true,
}: {
  widgets: HeaderWidget[];
  showProfile?: boolean;
  showWidgets?: boolean;
}) {
  if (!widgets?.length) return null;

  const filtered = widgets.filter(w => {
    if (w.type === 'profile') return showProfile;
    return showWidgets;
  });

  if (!filtered.length) return null;

  return (
    <div className="flex items-center gap-1">
      {filtered.map(w => <Widget key={w.id} w={w} />)}
    </div>
  );
}
