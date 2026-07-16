'use client';

import { useState, useEffect, useMemo } from 'react';
import { isBrowser } from '@/lib/is-browser';

// ─── Types ────────────────────────────────────────────────────────────────────

type LobbyIconType = 'none' | 'emoji' | 'image' | 'gif' | 'svg';

interface LobbyIconData {
  icon_type:      LobbyIconType;
  icon_emoji:     string | null;
  icon_media_url: string | null;
  icon_svg:       string | null;
}

interface PublicCategoryIcon extends LobbyIconData {
  id:                  number;
  category_code:       string;
  category_name:       string;
  is_default:          boolean;
  display_order:       number;
  image_display_size:  'auto' | 'small' | 'medium' | 'large' | 'custom';
  image_display_mode:  'contain' | 'cover' | 'stretch';
  image_custom_width:  number | null;
  image_custom_height: number | null;
}

const CATEGORY_IMAGE_SIZE_PX: Record<'small' | 'medium' | 'large', number> = {
  small:  48,
  medium: 64,
  large:  80,
};

// CSS class names injected once for auto-responsive category icon sizing
const CAT_AUTO_CSS = `
.gl-cat-img-auto { width: 72px; height: 72px; }
@media (max-width: 1023px) { .gl-cat-img-auto { width: 64px; height: 64px; } }
@media (max-width: 639px)  { .gl-cat-img-auto { width: 56px; height: 56px; } }
`;

// Unified card — same shape regardless of whether the data came from
// website_game_providers (platform mode) or website_games (games mode).
// Switching game_source is a config change only — no code rewrite required.
interface PublicLobbyCard extends LobbyIconData {
  id: string;                    // 'p-{id}' for providers, 'g-{id}' for games
  card_type: 'provider' | 'game';
  name: string;
  provider_id: number | null;
  provider_name: string | null;
  provider_code: string | null;
  category_code: string;         // from website_game_categories
  category_name: string;
  thumbnail_url: string | null;  // logo for providers; thumbnail for games
  banner_url: string | null;
  is_hot: boolean;
  is_new: boolean;
  display_order: number;
}

export interface GameLobbyConfig {
  // Data source — determines which API data populates the lobby
  // 'platform': one card per provider (current)
  // 'games':    one card per game (website_games table)
  // 'mixed':    games first, remaining providers as fallback
  game_source?: 'platform' | 'games' | 'mixed';
  design_preset?: string;
  layout_preset?: string;

  tabs_enabled?: boolean;
  tab_style?: string;
  tab_icon_mode?: string;
  tab_position?: string;
  tab_sticky?: boolean;
  tab_scroll?: string;
  tab_animation?: string;

  show_provider_filter?: boolean;
  provider_source?: string;
  provider_style?: string;
  provider_display?: string;
  provider_size?: string;
  provider_hover?: string;

  card_style?: string;
  card_image_mode?: string;
  card_ratio?: string;
  card_radius?: string;
  card_shadow?: string;
  card_border?: string;
  card_hover?: string;

  show_provider?: boolean;
  show_game_name?: boolean;
  show_hot_badge?: boolean;
  show_new_badge?: boolean;
  show_play_button?: boolean;
  show_demo_button?: boolean;
  button_style?: string;

  search_enabled?: boolean;
  search_style?: string;
  search_placeholder?: string;

  default_sort?: string;
  pagination_type?: string;

  card_animation?: string;
  scroll_animation?: boolean;

  color_bg?: string;
  color_card?: string;
  color_tab?: string;
  color_tab_active?: string;
  color_tab_inactive?: string;
  color_button?: string;
  color_border?: string;
  color_text?: string;
  color_accent?: string;

  font?: string;
  font_weight?: string;

  columns_desktop?: number;
  columns_tablet?: number;
  columns_mobile?: number;

  card_gap?: string;
  section_padding?: string;
  container_width?: string;

  // Icon display
  icon_size?:      string;  // 'tiny'|'small'|'medium'|'large'|custom px
  icon_shape?:     string;  // 'square'|'rounded'|'circle'
  icon_animation?: string;  // 'none'|'pulse'|'bounce'|'float'|'glow'|'rotate'|'shake'|'blink'
  icon_position?:  string;  // 'left'|'right'|'top'|'bottom'
  icon_gap?:       string;  // gap between icon and label
  icon_hover?:     string;  // 'none'|'scale'|'glow'|'rotate'|'shadow'|'brightness'

  // Global category image defaults — per-category settings override these
  category_image_size_default?: 'auto' | 'small' | 'medium' | 'large' | 'custom';
  category_image_mode_default?: 'contain' | 'cover' | 'stretch';
  category_hover_default?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
// No hardcoded categories — all loaded from /api/public/lobby-categories

const FONTS: Record<string, string> = {
  system:      'inherit',
  roboto:      '"Roboto", sans-serif',
  poppins:     '"Poppins", sans-serif',
  montserrat:  '"Montserrat", sans-serif',
  orbitron:    '"Orbitron", sans-serif',
  digital:     '"VT323", monospace',
};

const GOOGLE_FONTS_GL =
  'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700' +
  '&family=Poppins:wght@300;400;500;700&family=Montserrat:wght@300;400;500;700' +
  '&family=Orbitron:wght@400;700&family=VT323&display=swap';

let glFontsInjected = false;
function injectGLFonts() {
  if (glFontsInjected || !isBrowser) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = GOOGLE_FONTS_GL;
  document.head.appendChild(link);
  glFontsInjected = true;
}

// ─── CSS Helpers ──────────────────────────────────────────────────────────────

function getCardBackground(style: string, colorCard?: string, colorAccent?: string): string {
  if (colorCard) return colorCard;
  const accent = colorAccent ?? 'var(--brand-primary)';
  switch (style) {
    case 'modern':  return 'linear-gradient(135deg, rgba(20,20,40,0.95), rgba(10,10,28,0.95))';
    case 'glass':   return 'rgba(255,255,255,0.06)';
    case 'luxury':  return 'linear-gradient(135deg, #1a1200, #0a0800)';
    case 'minimal': return 'var(--bg-surface)';
    case 'rounded': return 'var(--bg-surface)';
    case 'neon':    return 'rgba(0,0,0,0.85)';
    case 'cyber':   return 'linear-gradient(135deg, rgba(5,0,20,0.95), rgba(10,0,40,0.95))';
    default:        return 'var(--bg-surface)'; // classic
  }
}

function getCardBorderStyle(border: string, style: string, colorBorder?: string, colorAccent?: string): React.CSSProperties {
  const accent = colorAccent ?? 'var(--brand-primary)';
  switch (border) {
    case 'solid':    return { border: `1px solid ${colorBorder ?? 'rgba(255,255,255,0.1)'}` };
    case 'gradient': return { border: '1px solid transparent', backgroundClip: 'padding-box' };
    case 'glow':     return { border: `1px solid ${accent}`, boxShadow: `0 0 8px ${accent}40` };
    default: {
      // Style-specific defaults
      if (style === 'glass')  return { border: '1px solid rgba(255,255,255,0.12)' };
      if (style === 'luxury') return { border: `1px solid ${accent}60` };
      if (style === 'neon')   return { border: `1px solid ${accent}` };
      if (style === 'cyber')  return { border: `1px solid ${accent}80` };
      return { border: '1px solid rgba(255,255,255,0.06)' };
    }
  }
}

function getCardShadow(shadow: string, colorAccent?: string): string {
  const accent = colorAccent ?? 'var(--brand-primary)';
  switch (shadow) {
    case 'soft':   return '0 2px 8px rgba(0,0,0,0.25)';
    case 'medium': return '0 4px 16px rgba(0,0,0,0.4)';
    case 'heavy':  return '0 8px 32px rgba(0,0,0,0.55)';
    case 'glow':   return `0 0 20px ${accent}50`;
    default:       return 'none';
  }
}

function getCardRadius(style: string, cardRadius?: string): string {
  if (cardRadius) return cardRadius;
  switch (style) {
    case 'modern':  return '16px';
    case 'glass':   return '16px';
    case 'rounded': return '24px';
    case 'cyber':   return '4px';
    case 'minimal': return '8px';
    default:        return '12px';
  }
}

function getCardRatioPaddingTop(ratio: string): string {
  switch (ratio) {
    case '1:1':  return '100%';
    case '4:3':  return '75%';
    case '16:9': return '56.25%';
    case '3:4':  return '133.33%';
    default:     return '133.33%'; // 3:4 default
  }
}

function getTabStyle(tabStyle: string, isActive: boolean, colorTabActive?: string, colorTabInactive?: string, colorAccent?: string): React.CSSProperties {
  const accent = colorAccent ?? 'var(--brand-primary)';
  const activeColor = colorTabActive ?? accent;
  const inactiveColor = colorTabInactive ?? undefined;

  if (isActive) {
    switch (tabStyle) {
      case 'underline':
        return { borderBottom: `2px solid ${activeColor}`, color: activeColor, background: 'transparent', borderRadius: 0 };
      case 'neon':
        return { background: 'transparent', color: activeColor, boxShadow: `0 0 12px ${activeColor}`, border: `1px solid ${activeColor}`, borderRadius: '8px' };
      case 'glass':
        return { background: 'rgba(255,255,255,0.15)', color: '#fff', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px' };
      case 'segment':
        return { background: '#fff', color: '#000', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' };
      case 'gradient':
        return { background: `linear-gradient(135deg, ${activeColor}, ${activeColor}99)`, color: '#fff', borderRadius: '10px' };
      case 'capsule':
        return { background: activeColor, color: '#fff', borderRadius: '999px' };
      case 'pill':
        return { background: activeColor, color: '#fff', borderRadius: '999px' };
      case 'rounded':
        return { background: activeColor, color: '#fff', borderRadius: '10px' };
      default: // classic, minimal
        return { background: activeColor, color: '#fff', borderRadius: '8px' };
    }
  } else {
    const base: React.CSSProperties = { background: 'transparent', color: inactiveColor ?? 'var(--text-muted)', borderRadius: '8px' };
    if (tabStyle === 'underline') return { ...base, borderBottom: '2px solid transparent', borderRadius: 0 };
    if (tabStyle === 'neon') return { ...base, border: '1px solid transparent' };
    if (tabStyle === 'segment') return { ...base, color: '#666' };
    return base;
  }
}

// ─── CSS Keyframes ────────────────────────────────────────────────────────────

const GL_KEYFRAMES = `
@keyframes gl-fade-in   { from{opacity:0} to{opacity:1} }
@keyframes gl-slide-in  { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
@keyframes gl-scale-in  { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
@keyframes gl-bounce-in { 0%{opacity:0;transform:scale(0.8)} 70%{transform:scale(1.04)} 100%{opacity:1;transform:scale(1)} }
@keyframes gl-float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes gl-pulse     { 0%,100%{opacity:1} 50%{opacity:0.65} }
`;

const ANIM_CLASS: Record<string, string> = {
  fade:   'gl-anim-fade',
  slide:  'gl-anim-slide',
  scale:  'gl-anim-scale',
  bounce: 'gl-anim-bounce',
  float:  'gl-anim-float',
  pulse:  'gl-anim-pulse',
};

function getAnimCSS(animation?: string): string {
  if (!animation || animation === 'none') return '';
  const dur = animation === 'float' ? '3s ease-in-out infinite' : animation === 'pulse' ? '2s ease-in-out infinite' : '0.4s ease both';
  const name = `gl-${animation}-in`.replace('float-in', 'float').replace('pulse-in', 'pulse');
  return `.gl-anim-${animation} { animation: ${name} ${dur}; }`;
}

// ─── IconRenderer ────────────────────────────────────────────────────────────

interface IconRendererProps {
  icon:               LobbyIconData;
  sizePx?:            number;
  shape?:             string;  // 'square'|'rounded'|'circle'
  hover?:             string;  // 'none'|'scale'|'glow'|'rotate'|'shadow'|'brightness'
  accent?:            string;
  style?:             React.CSSProperties;
  // Per-category image overrides — only applied when icon_type is 'image'|'gif'
  imageDisplaySize?:  'auto' | 'small' | 'medium' | 'large' | 'custom';
  imageDisplayMode?:  'contain' | 'cover' | 'stretch';
  imageCustomWidth?:  number | null;
  imageCustomHeight?: number | null;
}

function IconRenderer({
  icon, sizePx = 20, shape = 'square', hover = 'none',
  accent = 'var(--brand-primary)', style,
  imageDisplaySize, imageDisplayMode, imageCustomWidth, imageCustomHeight,
}: IconRendererProps) {
  const [hovered, setHovered] = useState(false);

  if (icon.icon_type === 'none') return null;

  const isImageIcon = icon.icon_type === 'image' || icon.icon_type === 'gif';

  // Determine if we use CSS-responsive auto sizing
  const useAutoClass = isImageIcon && imageDisplaySize === 'auto';

  // Resolve fixed pixel size for non-auto image icons
  const imgPx = isImageIcon && !useAutoClass
    ? imageDisplaySize === 'custom'
      ? Math.max(24, Math.min(200, imageCustomWidth ?? 72))
      : imageDisplaySize === 'small'  ? CATEGORY_IMAGE_SIZE_PX.small
      : imageDisplaySize === 'medium' ? CATEGORY_IMAGE_SIZE_PX.medium
      : imageDisplaySize === 'large'  ? CATEGORY_IMAGE_SIZE_PX.large
      : sizePx
    : sizePx;

  const imgH = isImageIcon && !useAutoClass && imageDisplaySize === 'custom'
    ? Math.max(24, Math.min(200, imageCustomHeight ?? imgPx))
    : imgPx;

  const objFit: React.CSSProperties['objectFit'] =
    imageDisplayMode === 'cover'   ? 'cover' :
    imageDisplayMode === 'stretch' ? 'fill'  :
    'contain';

  const borderRadius =
    shape === 'circle'  ? '50%' :
    shape === 'rounded' ? `${Math.round(imgPx * 0.2)}px` :
    '0';

  const hoverStyle: React.CSSProperties = hovered ? (
    hover === 'scale'      ? { transform: 'scale(1.15)' } :
    hover === 'glow'       ? { filter: `drop-shadow(0 0 6px ${accent})` } :
    hover === 'rotate'     ? { transform: 'rotate(15deg)' } :
    hover === 'shadow'     ? { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' } :
    hover === 'brightness' ? { filter: 'brightness(1.3)' } :
    {}
  ) : {};

  const baseStyle: React.CSSProperties = {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    transition:     'all 0.2s ease',
    ...hoverStyle,
    ...style,
  };

  const events = hover !== 'none'
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
    : {};

  if (icon.icon_type === 'emoji' && icon.icon_emoji) {
    return (
      <span style={{ ...baseStyle, fontSize: sizePx, lineHeight: 1 }} {...events}>
        {icon.icon_emoji}
      </span>
    );
  }

  if (isImageIcon && icon.icon_media_url) {
    if (useAutoClass) {
      // Auto responsive mode — CSS class controls width/height across breakpoints
      return (
        <div
          className="gl-cat-img-auto"
          style={{ ...baseStyle, borderRadius, overflow: 'hidden', background: 'transparent' }}
          {...events}
        >
          <img
            src={icon.icon_media_url}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: objFit, display: 'block' }}
          />
        </div>
      );
    }

    return (
      <div
        style={{
          ...baseStyle,
          width:      imgPx,
          height:     imgH,
          borderRadius,
          overflow:   'hidden',
          background: 'transparent',
        }}
        {...events}
      >
        <img
          src={icon.icon_media_url}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: objFit, display: 'block' }}
        />
      </div>
    );
  }

  if (icon.icon_type === 'svg' && icon.icon_svg) {
    return (
      <span
        style={{ ...baseStyle, width: sizePx, height: sizePx, display: 'inline-block' }}
        dangerouslySetInnerHTML={{ __html: icon.icon_svg }}
        {...events}
      />
    );
  }

  return null;
}

// ─── GameLobbyCard ────────────────────────────────────────────────────────────

interface CardProps {
  card: PublicLobbyCard;   // unified — works for providers AND games
  cfg: GameLobbyConfig;
  accent: string;
  animClass: string;
  fontFamily: string;
}

function GameLobbyCard({ card, cfg, accent, animClass, fontFamily }: CardProps) {
  const [hovered, setHovered] = useState(false);

  const style     = cfg.card_style      ?? 'classic';
  const shadow    = cfg.card_shadow     ?? 'medium';
  const border    = cfg.card_border     ?? 'none';
  const hoverFx   = cfg.card_hover      ?? 'lift';
  const imageMode = cfg.card_image_mode ?? 'cover';
  const ratio     = cfg.card_ratio      ?? '3:4';
  const radius    = getCardRadius(style, cfg.card_radius);

  // Unified image resolution — banner takes priority for atmosphere
  const imgUrl = card.banner_url ?? card.thumbnail_url;

  // Hover classes (CSS-driven)
  const hoverClass = hovered ? ` gl-card-hovered-${hoverFx}` : '';

  const cardStyle: React.CSSProperties = {
    position:     'relative',
    overflow:     'hidden',
    cursor:       'pointer',
    borderRadius: radius,
    background:   getCardBackground(style, cfg.color_card, accent),
    boxShadow:    hovered && shadow === 'glow'
      ? `0 0 32px ${accent}70`
      : hovered && shadow === 'heavy'
        ? '0 12px 40px rgba(0,0,0,0.65)'
        : getCardShadow(shadow, accent),
    transition:   'all 0.25s ease',
    transform:    hovered
      ? hoverFx === 'zoom' ? 'scale(1.05)'
      : hoverFx === 'lift' ? 'translateY(-6px)'
      : hoverFx === 'rotate' ? 'rotate(1.5deg) scale(1.02)'
      : hoverFx === 'tilt' ? 'perspective(400px) rotateY(6deg)'
      : 'none'
      : 'none',
    filter: hovered && hoverFx === 'glow'
      ? `brightness(1.15) drop-shadow(0 0 14px ${accent})`
      : undefined,
    fontFamily,
    ...getCardBorderStyle(border, style, cfg.color_border, accent),
  };

  // Style-specific backdrop
  if (style === 'glass') {
    (cardStyle as Record<string, unknown>).backdropFilter = 'blur(12px)';
  }

  const paddingTop = getCardRatioPaddingTop(ratio);
  const objectFit: React.CSSProperties['objectFit'] =
    imageMode === 'contain' ? 'contain'
    : imageMode === 'fill'  ? 'fill'
    : imageMode === 'original' ? 'none'
    : 'cover';

  const showName     = cfg.show_game_name    !== false;
  const showHot      = cfg.show_hot_badge    !== false && card.is_hot;
  const showNew      = cfg.show_new_badge    !== false && card.is_new && !card.is_hot;
  const showPlay     = cfg.show_play_button  === true;
  const showDemo     = cfg.show_demo_button  === true;
  const btnStyle     = cfg.button_style ?? 'rounded';

  const btnBase: React.CSSProperties = {
    padding:       '4px 12px',
    fontSize:      11,
    fontWeight:    600,
    borderRadius:  btnStyle === 'rounded' || btnStyle === 'classic' ? '999px' : btnStyle === 'glass' ? '8px' : '6px',
    border:        'none',
    cursor:        'pointer',
    transition:    'all 0.2s ease',
    background:    btnStyle === 'glass' ? 'rgba(255,255,255,0.15)'
                 : btnStyle === 'gradient' ? `linear-gradient(135deg, ${accent}, ${accent}99)`
                 : btnStyle === 'neon' ? 'transparent'
                 : accent,
    color:         '#fff',
    boxShadow:     btnStyle === 'neon' ? `0 0 8px ${accent}, inset 0 0 8px ${accent}40` : undefined,
  };

  return (
    <a href="/download" style={{ textDecoration: 'none', display: 'block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={animClass} style={cardStyle}>
        {/* Aspect ratio container */}
        <div style={{ paddingTop, position: 'relative' }}>
          {/* Image / placeholder */}
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={card.name}
              loading="lazy"
              style={{
                position:       'absolute',
                inset:          0,
                width:          '100%',
                height:         '100%',
                objectFit,
                objectPosition: 'center',
              }}
            />
          ) : (
            <div style={{
              position:   'absolute',
              inset:      0,
              background: 'var(--bg-surface2)',
            }} />
          )}

          {/* Gradient overlay for text legibility */}
          {showName && (
            <div style={{
              position:   'absolute',
              inset:      0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)',
            }} />
          )}

          {/* Badges */}
          {showHot && (
            <span style={{
              position: 'absolute', top: 8, right: 8,
              background: '#ef4444', color: '#fff',
              fontSize: 9, fontWeight: 700, lineHeight: 1.6,
              padding: '1px 6px', borderRadius: 999,
              boxShadow: '0 0 8px rgba(239,68,68,0.6)',
            }}>HOT</span>
          )}
          {showNew && (
            <span style={{
              position: 'absolute', top: 8, right: 8,
              background: accent, color: '#fff',
              fontSize: 9, fontWeight: 700, lineHeight: 1.6,
              padding: '1px 6px', borderRadius: 999,
            }}>NEW</span>
          )}

          {/* Card bottom info */}
          {(showName || showPlay || showDemo) && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '8px 10px',
            }}>
              {showName && (
                <p style={{
                  color:      cfg.color_text ?? '#fff',
                  fontSize:   11,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  margin:     0,
                  marginBottom: (showPlay || showDemo) ? 6 : 0,
                  whiteSpace: 'nowrap',
                  overflow:   'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {card.name}
                </p>
              )}
              {/* For game cards: show provider name as sub-label */}
              {card.card_type === 'game' && card.provider_name && cfg.show_provider !== false && (
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, margin: 0, marginTop: 1 }}>
                  {card.provider_name}
                </p>
              )}
              {(showPlay || showDemo) && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {showPlay && <button style={btnBase}>Play</button>}
                  {showDemo && <button style={{ ...btnBase, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>Demo</button>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </a>
  );
}

// ─── ProviderFilter ───────────────────────────────────────────────────────────

interface ProviderFilterProps {
  cards: PublicLobbyCard[];
  activeCategory: string;
  activeProvider: number | null;
  onSelect: (id: number | null) => void;
  cfg: GameLobbyConfig;
  accent: string;
}

function ProviderFilter({ cards, activeCategory, activeProvider, onSelect, cfg, accent }: ProviderFilterProps) {
  const providerStyle   = cfg.provider_style  ?? 'horizontal';
  const providerDisplay = cfg.provider_display ?? 'logo_text';
  const providerSize    = cfg.provider_size    ?? 'medium';

  // Derive unique providers from cards in the active category
  const uniqueProviders = useMemo(() => {
    const filtered = activeCategory === 'all' ? cards
      : activeCategory === 'hot' ? cards.filter(c => c.is_hot)
      : cards.filter(c => c.category_code === activeCategory);
    const seen = new Map<number, { id: number; name: string; logo: string | null }>();
    for (const c of filtered) {
      if (c.provider_id !== null && !seen.has(c.provider_id)) {
        seen.set(c.provider_id, {
          id:   c.provider_id,
          name: c.provider_name ?? '',
          logo: c.card_type === 'provider' ? c.thumbnail_url : null,
        });
      }
    }
    return [...seen.values()];
  }, [cards, activeCategory]);

  if (uniqueProviders.length === 0) return null;

  const logoSize = providerSize === 'small' ? 24 : providerSize === 'large' ? 40 : 32;

  const itemStyle = (isActive: boolean): React.CSSProperties => ({
    display:        'flex',
    alignItems:     'center',
    gap:            6,
    padding:        providerSize === 'small' ? '4px 8px' : providerSize === 'large' ? '8px 14px' : '6px 10px',
    borderRadius:   providerStyle === 'pill' || providerStyle === 'chip' ? 999 : 8,
    border:         isActive ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.1)',
    background:     isActive ? `${accent}20` : 'rgba(255,255,255,0.04)',
    cursor:         'pointer',
    transition:     'all 0.2s ease',
    whiteSpace:     'nowrap' as const,
    fontSize:       providerSize === 'small' ? 10 : 12,
    color:          isActive ? accent : 'var(--text-muted)',
    fontWeight:     isActive ? 600 : 400,
    flexShrink:     0,
  });

  if (providerStyle === 'dropdown') {
    return (
      <select
        value={activeProvider ?? ''}
        onChange={e => onSelect(e.target.value === '' ? null : Number(e.target.value))}
        style={{
          padding:      '6px 12px',
          borderRadius: 8,
          border:       `1px solid ${accent}40`,
          background:   'var(--bg-surface)',
          color:        'var(--text-base)',
          fontSize:     13,
          cursor:       'pointer',
          width:        '100%',
          maxWidth:     320,
        }}>
        <option value="">全部平台</option>
        {uniqueProviders.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
      <button onClick={() => onSelect(null)} style={itemStyle(activeProvider === null)}>
        {(providerDisplay === 'text' || providerDisplay === 'logo_text') && <span>全部</span>}
      </button>
      {uniqueProviders.map(p => {
        const isActive = activeProvider === p.id;
        return (
          <button key={p.id} onClick={() => onSelect(isActive ? null : p.id)} style={itemStyle(isActive)}>
            {p.logo && providerDisplay !== 'text' && (
              <img src={p.logo} alt={p.name} loading="lazy"
                style={{ width: logoSize, height: logoSize, objectFit: 'contain' }} />
            )}
            {providerDisplay !== 'logo' && <span>{p.name}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── CategoryTabs ─────────────────────────────────────────────────────────────

interface TabsProps {
  categories: PublicCategoryIcon[];  // full dynamic category list from API
  cards:      PublicLobbyCard[];
  active:     string;
  onSelect:   (key: string) => void;
  cfg:        GameLobbyConfig;
  accent:     string;
}

function CategoryTabs({ categories, cards, active, onSelect, cfg, accent }: TabsProps) {
  const tabStyle  = cfg.tab_style     ?? 'rounded';
  const iconMode  = cfg.tab_icon_mode ?? 'icon_text';
  const tabScroll = cfg.tab_scroll    ?? 'scrollable';

  const iconSizePx = cfg.icon_size === 'tiny'   ? 14
                   : cfg.icon_size === 'small'   ? 16
                   : cfg.icon_size === 'large'   ? 24
                   : parseInt(cfg.icon_size ?? '', 10) || 18;
  const iconShape  = cfg.icon_shape    ?? 'square';
  const iconHover  = cfg.icon_hover    ?? 'none';
  const iconGap    = cfg.icon_gap      ?? '4px';
  const iconPos    = cfg.icon_position ?? 'left';

  // Only show categories that have at least one matching card
  const visibleCats = useMemo(() => {
    return categories.filter(cat => {
      if (cat.category_code === 'all') return true;
      if (cat.category_code === 'hot') return cards.some(c => c.is_hot);
      return cards.some(c => c.category_code === cat.category_code);
    });
  }, [categories, cards]);

  const wrapStyle: React.CSSProperties = {
    display:        'flex',
    justifyContent: tabScroll === 'centered' ? 'center' : undefined,
    gap:            4,
    overflowX:      tabScroll === 'scrollable' ? 'auto' : undefined,
    flexWrap:       tabScroll === 'full_width' ? 'wrap' : undefined,
    padding:        tabStyle === 'segment' ? 4 : 0,
    background:     tabStyle === 'segment' ? 'var(--bg-surface2)' : cfg.color_tab ?? 'transparent',
    borderRadius:   tabStyle === 'segment' ? 12 : undefined,
  };

  const btnBase: React.CSSProperties = {
    flexShrink:    0,
    display:       'inline-flex',
    alignItems:    'center',
    flexDirection: (iconPos === 'top' || iconPos === 'bottom') ? 'column' : 'row',
    gap:           iconGap,
    padding:       '6px 14px',
    fontSize:      12,
    fontWeight:    500,
    cursor:        'pointer',
    border:        'none',
    transition:    'all 0.2s ease',
    flex:          tabScroll === 'full_width' ? '1 0 auto' : undefined,
  };

  return (
    <div style={wrapStyle}>
      {visibleCats.map(cat => {
        const isActive = active === cat.category_code;
        const tabCss   = getTabStyle(tabStyle, isActive, cfg.color_tab_active, cfg.color_tab_inactive, accent);
        const showIcon = iconMode !== 'text_only' && cat.icon_type !== 'none';
        const showLabel = iconMode !== 'icon_only';

        const iconEl = showIcon ? (
          <IconRenderer
            icon={cat}
            sizePx={iconSizePx}
            shape={iconShape}
            hover={iconHover}
            accent={accent}
            imageDisplaySize={cat.image_display_size}
            imageDisplayMode={cat.image_display_mode}
            imageCustomWidth={cat.image_custom_width}
            imageCustomHeight={cat.image_custom_height}
          />
        ) : null;

        return (
          <button
            key={cat.category_code}
            onClick={() => onSelect(cat.category_code)}
            style={{ ...btnBase, ...tabCss }}
          >
            {(iconPos === 'left' || iconPos === 'top') && iconEl}
            {showLabel && <span>{cat.category_name}</span>}
            {(iconPos === 'right' || iconPos === 'bottom') && iconEl}
          </button>
        );
      })}
    </div>
  );
}

// ─── SearchBar ────────────────────────────────────────────────────────────────

interface SearchProps {
  value: string;
  onChange: (v: string) => void;
  cfg: GameLobbyConfig;
  accent: string;
}

function SearchBar({ value, onChange, cfg, accent }: SearchProps) {
  const searchStyle  = cfg.search_style ?? 'outline';
  const placeholder  = cfg.search_placeholder ?? '搜索游戏...';

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    padding:      '8px 14px 8px 36px',
    fontSize:     13,
    borderRadius: searchStyle === 'rounded' ? 999 : searchStyle === 'minimal' ? 0 : 8,
    border:       searchStyle === 'filled' || searchStyle === 'minimal'
                  ? 'none'
                  : `1px solid ${accent}40`,
    background:   searchStyle === 'filled'  ? 'var(--bg-surface2)'
                : searchStyle === 'glass'   ? 'rgba(255,255,255,0.08)'
                : searchStyle === 'minimal' ? 'transparent'
                : 'transparent',
    color:        'var(--text-base)',
    outline:      'none',
    backdropFilter: searchStyle === 'glass' ? 'blur(8px)' : undefined,
    borderBottom:   searchStyle === 'minimal' ? `1px solid ${accent}40` : undefined,
  };

  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted)' }}>
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
      {value && (
        <button onClick={() => onChange('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}>
          ✕
        </button>
      )}
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

export default function GameLobbySection({ config }: { config: GameLobbyConfig }) {
  const [cards, setCards]               = useState<PublicLobbyCard[] | null>(null);
  const [categories, setCategories]     = useState<PublicCategoryIcon[]>([]);
  const [activeCategory, setCategory]   = useState('all');
  const [activeProvider, setProvider]   = useState<number | null>(null);
  const [searchQuery, setSearch]        = useState('');
  const [visibleCount, setVisibleCount] = useState(20);

  const gameSource = config.game_source ?? 'platform';

  // Apply Google Fonts
  useEffect(() => {
    if (config.font && config.font !== 'system' && config.font !== 'custom') {
      injectGLFonts();
    }
  }, [config.font]);

  // Fetch dynamic categories from DB (includes name, icon, is_default)
  useEffect(() => {
    fetch('/api/public/lobby-categories')
      .then(r => r.ok ? r.json() as Promise<PublicCategoryIcon[]> : Promise.resolve([]))
      .then(data => {
        setCategories(data);
        // Set default category on first load
        const def = data.find(c => c.is_default);
        if (def) setCategory(def.category_code);
      })
      .catch(() => {});
  }, []);

  // Fetch unified lobby cards — re-fetch when game_source changes
  useEffect(() => {
    setCards(null);
    fetch(`/api/public/game-lobby?source=${gameSource}`)
      .then(r => r.ok ? r.json() as Promise<PublicLobbyCard[]> : Promise.resolve([]))
      .then(data => setCards(data))
      .catch(() => setCards([]));
  }, [gameSource]);

  // Reset filters when category changes
  useEffect(() => { setProvider(null); setVisibleCount(20); }, [activeCategory]);

  const accent     = config.color_accent ?? 'var(--brand-primary)';
  const fontFamily = FONTS[config.font ?? 'system'] ?? 'inherit';
  const animation  = config.card_animation ?? 'fade';
  const animClass  = animation !== 'none' ? (ANIM_CLASS[animation] ?? '') : '';

  // Grid column classes
  const colD = config.columns_desktop ?? 5;
  const colT = config.columns_tablet  ?? 3;
  const colM = config.columns_mobile  ?? 2;
  const gapValue = config.card_gap ?? '12px';

  const colClass = `grid-cols-${colM} sm:grid-cols-${colT} lg:grid-cols-${colD}`;

  // Filter + sort — works identically for all card types (unified interface)
  const displayCards = useMemo(() => {
    if (!cards) return [];

    let list = [...cards];

    // Category filter — uses dynamic category_code from DB
    if (activeCategory === 'hot')       list = list.filter(c => c.is_hot);
    else if (activeCategory !== 'all')  list = list.filter(c => c.category_code === activeCategory);

    // Provider filter (by provider_id — works for both provider and game cards)
    if (activeProvider !== null) list = list.filter(c => c.provider_id === activeProvider);

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.provider_name ?? '').toLowerCase().includes(q) ||
        (c.provider_code ?? '').toLowerCase().includes(q)
      );
    }

    // Sort
    const sort = config.default_sort ?? 'popular';
    if (sort === 'a_z')       list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'newest')    list.sort((a, b) => b.id.localeCompare(a.id));
    else if (sort === 'random')    list.sort(() => Math.random() - 0.5);
    else if (sort === 'provider')  list.sort((a, b) => (a.provider_name ?? '').localeCompare(b.provider_name ?? ''));
    // popular / default: keep display_order

    return list;
  }, [cards, activeCategory, activeProvider, searchQuery, config.default_sort]);

  const visibleCards = useMemo(
    () => displayCards.slice(0, visibleCount),
    [displayCards, visibleCount]
  );

  const hasMore = visibleCount < displayCards.length;
  const paginationType = config.pagination_type ?? 'load_more';

  const sectionStyle: React.CSSProperties = {
    background:  config.color_bg,
    padding:     config.section_padding,
    fontFamily,
    fontWeight:  config.font_weight === 'light'  ? 300
               : config.font_weight === 'bold'   ? 700
               : config.font_weight === 'medium' ? 500
               : 400,
  };

  const containerStyle: React.CSSProperties = {
    maxWidth:  config.container_width ?? undefined,
    margin:    config.container_width ? '0 auto' : undefined,
  };

  const tabsEnabled = config.tabs_enabled !== false;
  const showProvider = config.show_provider_filter !== false;
  const searchEnabled = config.search_enabled === true;

  const keyframes = `
    ${GL_KEYFRAMES}
    ${getAnimCSS(animation)}
    ${CAT_AUTO_CSS}
  `;

  return (
    <>
      <style>{keyframes}</style>
      <section style={sectionStyle}>
        <div style={containerStyle}>

          {/* Category Tabs — dynamic from DB */}
          {tabsEnabled && cards !== null && cards.length > 0 && categories.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <CategoryTabs
                categories={categories}
                cards={cards}
                active={activeCategory}
                onSelect={key => { setCategory(key); setProvider(null); setVisibleCount(20); }}
                cfg={config}
                accent={accent}
              />
            </div>
          )}

          {/* Provider Filter + Search row */}
          {(showProvider || searchEnabled) && cards !== null && cards.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {showProvider && (
                <div style={{ flex: config.provider_style === 'dropdown' ? '0 0 auto' : '1 1 auto', minWidth: 0 }}>
                  <ProviderFilter
                    cards={cards}
                    activeCategory={activeCategory}
                    activeProvider={activeProvider}
                    onSelect={setProvider}
                    cfg={config}
                    accent={accent}
                  />
                </div>
              )}
              {searchEnabled && (
                <div style={{ flex: '0 0 220px', minWidth: 160 }}>
                  <SearchBar value={searchQuery} onChange={setSearch} cfg={config} accent={accent} />
                </div>
              )}
            </div>
          )}

          {/* Loading skeleton */}
          {cards === null && (
            <div className={`grid ${colClass}`} style={{ gap: gapValue }}>
              {Array.from({ length: colD * 2 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl"
                  style={{ paddingTop: getCardRatioPaddingTop(config.card_ratio ?? '3:4'), background: 'var(--bg-surface2)', position: 'relative' }} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {cards !== null && displayCards.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
              {searchQuery ? `没有找到"${searchQuery}"相关游戏` : '暂无游戏'}
            </div>
          )}

          {/* Game card grid */}
          {cards !== null && visibleCards.length > 0 && (
            <div className={`grid ${colClass}`} style={{ gap: gapValue }}>
              {visibleCards.map(c => (
                <GameLobbyCard
                  key={c.id}
                  card={c}
                  cfg={config}
                  accent={accent}
                  animClass={animClass}
                  fontFamily={fontFamily}
                />
              ))}
            </div>
          )}

          {/* Load More / Pagination */}
          {hasMore && paginationType === 'load_more' && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button
                onClick={() => setVisibleCount(v => v + 20)}
                style={{
                  padding:      '8px 32px',
                  borderRadius: 999,
                  border:       `1px solid ${accent}`,
                  background:   'transparent',
                  color:        accent,
                  fontSize:     13,
                  fontWeight:   600,
                  cursor:       'pointer',
                  transition:   'all 0.2s ease',
                }}>
                加载更多 ({displayCards.length - visibleCount})
              </button>
            </div>
          )}

          {hasMore && paginationType === 'infinite' && (
            <div style={{ textAlign: 'center', marginTop: 20, color: 'var(--text-muted)', fontSize: 12 }}>
              上拉加载更多...
            </div>
          )}

        </div>
      </section>
    </>
  );
}
