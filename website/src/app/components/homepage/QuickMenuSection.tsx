'use client';

import { useState } from 'react';
import Link from 'next/link';

interface MediaInfo { url: string; media_type: string; mime_type: string; }

interface QuickMenuItem {
  id: string;
  label: string;
  emoji: string;
  url: string;
  enabled: boolean;
  badge?: string;
  media: MediaInfo | null;
  media_id?: number | null;
  // Image rendering mode
  // undefined/null → fill_container (default when image uploaded)
  // 'icon'          → small 28–32px icon
  // 'fill_container'→ width:100%; height:100%; object-fit:cover (fills card)
  // 'cover'         → width:100%; fixed height; object-fit:cover
  // 'contain'       → width:100%; fixed height; object-fit:contain
  // 'original'      → natural dimensions (auto)
  // 'banner' / 'full_button' → legacy aliases for 'cover'
  image_mode?: 'icon' | 'fill_container' | 'cover' | 'contain' | 'original' | 'banner' | 'full_button';
  // Button dimensions (for cover/contain modes)
  btn_width?: string;   // e.g. '100%', '300px'
  btn_height_val?: string; // legacy; use card_height instead
  card_height?: 'auto' | 'small' | 'medium' | 'large' | string; // 'auto'=natural, 'small'=80px, 'medium'=120px, 'large'=180px, custom='240px'
  btn_radius?: string;
  btn_padding?: string;
  // Background
  btn_bg_type?: 'transparent' | 'solid' | 'gradient' | 'glass';
  btn_bg_color?: string;
  btn_bg_gradient?: string;
  // Image display tweaks
  img_position?: string;  // CSS object-position value e.g. 'center', 'top center'
  img_scale?: number;     // 50–200
  // Legacy compat
  btn_size?: 'small' | 'medium' | 'large' | 'custom';
  btn_custom_width?: number;
  btn_custom_height?: number;
  btn_height?: 'small' | 'medium' | 'large' | 'auto' | string;
  img_fit?: 'contain' | 'cover' | 'stretch' | 'original';
}

// ─── Types ────────────────────────────────────────────────────────────────────

type QMStyle =
  | 'filled'
  | 'transparent'
  | 'glass'
  | 'neon_outline'
  | 'floating'
  | 'minimal'
  | 'luxury'
  | 'cyber'
  | 'dark_glass'
  | 'modern'
  | 'rounded'
  | 'square'
  | 'compact';

type QMLayout  = 'icon_text' | 'icon_only' | 'text_only' | 'floating' | 'compact';
type QMHover   = 'none' | 'scale' | 'glow' | 'scale_glow' | 'pulse' | 'float';
type QMSpacing = 'small' | 'medium' | 'large';

interface CustomStyle {
  bg_color?: string;
  bg_opacity?: number;
  border_color?: string;
  border_width?: string;
  border_radius?: string;
  shadow_color?: string;
  glow_color?: string;
  hover_color?: string;
  text_color?: string;
  icon_color?: string;
  icon_size?: number;
  font_size?: number;
  padding?: string;
  gap?: string;
  card_height?: string;
  card_width?: string;
}

interface QuickMenuConfig {
  items: QuickMenuItem[];
  columns: number;
  style?: QMStyle;
  layout?: QMLayout;
  hover?: QMHover;
  spacing?: QMSpacing;
  custom_style?: CustomStyle;
}

// ─── Card appearance per style ────────────────────────────────────────────────

function getBaseCardStyle(style: QMStyle, custom?: CustomStyle): React.CSSProperties {
  let base: React.CSSProperties;
  switch (style) {
    case 'transparent':
      base = { background: 'transparent', border: 'none', boxShadow: 'none' };
      break;
    case 'glass':
      base = {
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      };
      break;
    case 'neon_outline':
      base = {
        background: 'transparent',
        border: '1px solid var(--brand-primary)',
        boxShadow: '0 0 8px color-mix(in srgb, var(--brand-primary) 25%, transparent)',
      };
      break;
    case 'floating':
      base = { background: 'transparent', border: 'none', boxShadow: 'none' };
      break;
    case 'minimal':
      base = { background: 'transparent', border: 'none', boxShadow: 'none' };
      break;
    case 'luxury':
      base = {
        background: '#050300',
        border: '1px solid #d97706',
        boxShadow: '0 4px 20px rgba(217,119,6,0.20), inset 0 1px 0 rgba(217,119,6,0.15)',
      };
      break;
    case 'cyber':
      base = {
        background: 'rgba(0,10,30,0.85)',
        border: '1px solid var(--brand-primary)',
        boxShadow: '0 0 12px color-mix(in srgb, var(--brand-primary) 20%, transparent), inset 0 1px 0 rgba(255,255,255,0.04)',
      };
      break;
    case 'dark_glass':
      base = {
        background: 'rgba(0,0,0,0.40)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      };
      break;
    case 'modern':
      base = {
        background: 'var(--bg-surface2)',
        border: '1px solid var(--border-dim)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      };
      break;
    case 'rounded':
      base = {
        background: 'var(--bg-card)',
        border: '1px solid var(--border-dim)',
        borderRadius: '999px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      };
      break;
    case 'square':
      base = {
        background: 'var(--bg-surface2)',
        border: '1px solid var(--border-mid)',
        borderRadius: '4px',
      };
      break;
    case 'compact':
      base = {
        background: 'var(--bg-surface3)',
        border: 'none',
        borderRadius: '8px',
      };
      break;
    case 'filled':
    default:
      base = {};
      break;
  }

  // Apply custom overrides on top
  if (custom?.bg_color)      base.background = custom.bg_color;
  if (custom?.bg_opacity !== undefined && custom?.bg_color) base.opacity = custom.bg_opacity;
  if (custom?.border_color)  base.borderColor = custom.border_color;
  if (custom?.border_width)  base.borderWidth = custom.border_width;
  if (custom?.border_radius) base.borderRadius = custom.border_radius;

  return base;
}

function getTextColor(style: QMStyle, custom?: CustomStyle): string {
  if (custom?.text_color)        return custom.text_color;
  if (style === 'luxury')        return '#d97706';
  if (style === 'neon_outline')  return 'var(--brand-primary)';
  return 'var(--text-base)';
}

function getGap(spacing: QMSpacing): string {
  return spacing === 'small' ? '6px' : spacing === 'large' ? '16px' : '8px';
}

function getPad(style: QMStyle, layout: QMLayout): string {
  if (style === 'compact' || layout === 'compact') return '6px 4px';
  if (layout === 'icon_only')  return '10px 6px';
  return '8px 6px';
}

// ─── Item ─────────────────────────────────────────────────────────────────────

function QuickMenuItemCard({
  item, style, layout, hover, custom,
}: {
  item: QuickMenuItem;
  style: QMStyle;
  layout: QMLayout;
  hover: QMHover;
  custom?: CustomStyle;
}) {
  const [hovered, setHovered] = useState(false);
  const imgSrc = item.media?.url ?? (item.media_id ? `/api/public/media/${item.media_id}` : null);
  const iconSize = custom?.icon_size ?? (layout === 'compact' ? 22 : 28);
  const fontSize = custom?.font_size ?? (layout === 'compact' ? 10 : 12);
  const textColor = getTextColor(style, custom);
  const padding = custom?.padding ?? getPad(style, layout);

  // ── CSS class hover for filled style (declared early — used in image mode early returns too) ──
  const hoverClass = style === 'filled' ? (
    hover === 'scale'      ? 'qm-hover-scale' :
    hover === 'glow'       ? 'qm-hover-glow' :
    hover === 'scale_glow' ? 'qm-hover-scale qm-hover-glow' :
    hover === 'pulse'      ? 'qm-hover-pulse' :
    hover === 'float'      ? 'qm-hover-float' : ''
  ) : '';

  // ── Image mode resolution ──────────────────────────────────────────────────
  // When an image is uploaded, default to fill_container (NOT icon).
  // Only render as a small icon when image_mode is explicitly 'icon'.
  type EffMode = 'icon' | 'fill_container' | 'cover' | 'contain' | 'original';
  const effectiveMode: EffMode = (() => {
    if (!imgSrc) return 'icon';
    const m = item.image_mode;
    if (m === 'icon') return 'icon';
    if (m === 'contain') return 'contain';
    if (m === 'original') return 'original';
    if (m === 'cover' || m === 'banner' || m === 'full_button') return 'cover';
    // undefined / null / 'fill_container' → fill the card
    return 'fill_container';
  })();

  // ── Non-icon image render ───────────────────────────────────────────────────
  if (effectiveMode !== 'icon' && imgSrc) {
    // object-fit per image mode — only applied when height is fixed (not auto)
    const objFit: React.CSSProperties['objectFit'] =
      effectiveMode === 'fill_container' ? 'fill'
      : effectiveMode === 'cover'        ? 'cover'
      : effectiveMode === 'contain'      ? 'contain'
      : 'none'; // original

    const objPos   = item.img_position ?? 'center';
    const imgScale = item.img_scale && item.img_scale !== 100 ? item.img_scale / 100 : null;

    // ── Card height resolution — backward compat: undefined → auto ──
    // Legacy fields checked last so new card_height always wins
    const cardHRaw = item.card_height
      ?? (item.btn_height_val || null)
      ?? ({ small: '60px', medium: '100px', large: '140px' } as Record<string,string>)[item.btn_size ?? '']
      ?? (item.btn_custom_height ? `${item.btn_custom_height}px` : null)
      ?? 'auto';

    const isAuto = cardHRaw === 'auto' || cardHRaw === '';
    // linkH: undefined → container has no fixed height (auto); string → container has fixed height
    const linkH = isAuto
      ? undefined
      : cardHRaw === 'small'  ? '80px'
      : cardHRaw === 'medium' ? '120px'
      : cardHRaw === 'large'  ? '180px'
      : cardHRaw; // custom px string e.g. '240px'

    const btnW  = item.btn_width ?? '100%';
    const btnBg = item.btn_bg_type === 'solid'    ? (item.btn_bg_color ?? 'transparent')
                : item.btn_bg_type === 'gradient' ? (item.btn_bg_gradient ?? 'transparent')
                : item.btn_bg_type === 'glass'    ? 'rgba(255,255,255,0.08)'
                : 'transparent';

    const baseCard = getBaseCardStyle(style, custom);
    const radius   = item.btn_radius || custom?.border_radius || (baseCard.borderRadius as string) || '12px';

    const hoverExtra: React.CSSProperties = {};
    if (hovered) {
      if (hover === 'scale')      hoverExtra.transform = 'scale(1.04)';
      if (hover === 'scale_glow') hoverExtra.transform = 'scale(1.03)';
      if (hover === 'float')      hoverExtra.transform = 'translateY(-5px)';
      if (hover === 'glow' || hover === 'scale_glow') {
        const gc = custom?.glow_color;
        hoverExtra.boxShadow = gc ? `0 0 20px ${gc}` : '0 0 14px rgba(255,255,255,0.25)';
      }
    }

    // ── Image element styles ──
    // AUTO:  image is natural size (width fills container, height is auto → no empty space)
    // FIXED: image fills Link container entirely via object-fit matching the selected mode
    const isOriginal = effectiveMode === 'original';
    const imgStyle: React.CSSProperties = isAuto
      ? {
          display:  'block',
          width:    isOriginal ? 'auto' : '100%',
          height:   'auto',
          maxWidth: '100%',
        }
      : {
          display:         'block',
          width:           '100%',
          height:          '100%',
          objectFit:       objFit,
          objectPosition:  objPos,
          transform:       imgScale ? `scale(${imgScale})` : undefined,
          transformOrigin: 'center',
        };

    return (
      <Link
        href={item.url || '#'}
        className={`relative block overflow-hidden ${hoverClass}`}
        style={{
          borderRadius:   radius,
          textDecoration: 'none',
          transition:     'all 0.2s ease',
          width:          btnW,
          height:         linkH,   // undefined → auto (image drives height); string → fixed
          background:     btnBg,
          padding:        item.btn_padding && item.btn_padding !== '0' ? item.btn_padding : undefined,
          alignSelf:      'start', // masonry-like: each card keeps its own natural height
          ...(custom?.card_width ? { width: custom.card_width } : {}),
          ...hoverExtra,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {item.badge && (
          <span className="absolute font-bold text-white z-10"
            style={{ background: 'var(--brand-primary)', fontSize: 8, lineHeight: 1.6, top: 6, right: 6, padding: '0 5px', borderRadius: 999 }}>
            {item.badge}
          </span>
        )}
        <img src={imgSrc} alt={item.label} style={imgStyle} />
      </Link>
    );
  }

  // ── Icon node (explicit icon mode OR no image) ──
  const icon = imgSrc && effectiveMode === 'icon' ? (
    <img src={imgSrc} alt={item.label}
      style={{ width: iconSize, height: iconSize, objectFit: 'contain' }} />
  ) : !imgSrc ? (
    <span style={{ fontSize: iconSize, lineHeight: 1, color: custom?.icon_color ?? 'inherit' }}>
      {item.emoji || '🎯'}
    </span>
  ) : null;

  // ── Badge ──
  const badge = item.badge ? (
    <span
      className="absolute font-bold text-white z-10"
      style={{
        background: 'var(--brand-primary)', fontSize: 8, lineHeight: 1.6,
        top: -4, right: -4, padding: '0 4px', borderRadius: 999,
      }}
    >
      {item.badge}
    </span>
  ) : null;

  // ── Hover transform/filter for non-filled (JS-driven) ──
  const hoverTransform: React.CSSProperties = {};
  if (hovered && style !== 'filled') {
    if (hover === 'scale')      { hoverTransform.transform = 'scale(1.08)'; }
    if (hover === 'scale_glow') { hoverTransform.transform = 'scale(1.06)'; }
    if (hover === 'float')      { hoverTransform.transform = 'translateY(-6px)'; }
    if (hover === 'glow' || hover === 'scale_glow') {
      hoverTransform.filter = 'drop-shadow(0 0 8px var(--brand-primary))';
    }
    if (hover === 'glow' || hover === 'scale_glow') {
      if (custom?.glow_color) {
        hoverTransform.boxShadow = `0 0 16px ${custom.glow_color}`;
        delete hoverTransform.filter;
      }
    }
    if (custom?.hover_color) {
      hoverTransform.background = custom.hover_color;
    }
  }

  // Separate glow/hover for filled (handled via CSS class)
  const hoverGlowStyle: React.CSSProperties = {};
  if (hovered && style === 'filled' && custom?.glow_color) {
    hoverGlowStyle.boxShadow = `0 0 16px ${custom.glow_color}`;
  }
  if (hovered && style === 'filled' && custom?.hover_color) {
    hoverGlowStyle.background = custom.hover_color;
  }

  // ── Card style (appearance only, no layout) for non-filled ──
  const cardAppearance: React.CSSProperties = {
    ...getBaseCardStyle(style, custom),
    ...hoverTransform,
    padding,
    ...(custom?.card_height ? { minHeight: custom.card_height } : {}),
    ...(custom?.card_width  ? { width: custom.card_width } : {}),
    // Layout
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    gap: 3,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    textDecoration: 'none',
  };

  // ── Render ──
  if (style === 'filled') {
    return (
      <Link
        href={item.url || '#'}
        className={`casino-card casino-card-hover flex flex-col items-center justify-center text-center py-1.5 px-1 gap-0.5 transition-all relative ${hoverClass}`}
        style={{ textDecoration: 'none', alignSelf: 'start', ...hoverGlowStyle }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {badge}
        {layout !== 'text_only' && (
          imgSrc
            ? <img src={imgSrc} alt={item.label} className="w-10 h-10 object-contain" />
            : <span style={{ fontSize: 28 }}>{item.emoji || '🎯'}</span>
        )}
        {layout !== 'icon_only' && (
          <p className="font-semibold leading-tight"
            style={{ color: 'var(--text-base)', fontSize: 13 }}>
            {item.label}
          </p>
        )}
      </Link>
    );
  }

  // Non-filled: Link is transparent wrapper, the div is the visual card
  return (
    <Link
      href={item.url || '#'}
      style={{ textDecoration: 'none', display: 'block', alignSelf: 'start' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={cardAppearance}>
        {badge}
        {layout !== 'text_only' && icon}
        {layout !== 'icon_only' && (
          <p style={{ color: textColor, fontSize, fontWeight: 600, lineHeight: 1.3, marginTop: 2 }}>
            {item.label}
          </p>
        )}
      </div>
    </Link>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

const COL_MAP: Record<number, string> = {
  2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5',
};

export default function QuickMenuSection({ config }: { config: QuickMenuConfig }) {
  const {
    items        = [],
    columns      = 4,
    style        = 'filled',
    layout       = 'icon_text',
    hover        = 'scale_glow',
    spacing      = 'medium',
    custom_style,
  } = config;

  const activeItems = items.filter(i => i.enabled);
  if (activeItems.length === 0) return null;

  const gridClass = COL_MAP[columns] ?? 'grid-cols-4';
  const gap = custom_style?.gap ?? getGap(spacing);

  return (
    <>
      {/* Hover effect keyframes — only injected once per page render */}
      <style>{`
        .qm-hover-scale:hover        { transform: scale(1.08) !important; }
        .qm-hover-glow:hover         { filter: drop-shadow(0 0 8px var(--brand-primary)) !important; }
        .qm-hover-pulse:hover        { animation: qm-pulse 1s ease-in-out infinite !important; }
        .qm-hover-float:hover        { transform: translateY(-6px) !important; }
        @keyframes qm-pulse {
          0%,100% { box-shadow: 0 0 8px color-mix(in srgb, var(--brand-primary) 30%, transparent); }
          50%     { box-shadow: 0 0 24px color-mix(in srgb, var(--brand-primary) 65%, transparent); }
        }
      `}</style>
      <div className={`grid ${gridClass}`} style={{ gap, alignItems: 'start' }}>
        {activeItems.map(item => (
          <QuickMenuItemCard
            key={item.id}
            item={item}
            style={style}
            layout={layout}
            hover={hover}
            custom={custom_style}
          />
        ))}
      </div>
    </>
  );
}
