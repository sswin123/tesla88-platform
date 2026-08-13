/**
 * Card Renderer — Phase M5-D
 * All styling uses the canonical --pb-* CSS variable system.
 */
import React from 'react';
import type { PartnerCard, LayoutJson, BonusItem } from './index';

type CardLayout = 'grid' | 'list' | 'carousel';

// Custom bonus_items take priority when at least 1 item exists; otherwise
// fall back to the legacy welcome_bonus/free_credit/commission/promo_text
// fields so old Partner Cards keep rendering exactly as before.
function resolveBonusItems(card: PartnerCard): BonusItem[] {
  if (card.bonus_items && card.bonus_items.length > 0) return card.bonus_items;
  const legacy: BonusItem[] = [];
  if (card.welcome_bonus) legacy.push({ label: 'Welcome Bonus', value: card.welcome_bonus });
  if (card.free_credit)   legacy.push({ label: 'Free Credit',   value: card.free_credit });
  if (card.commission)    legacy.push({ label: 'Commission',    value: card.commission });
  if (card.promo_text)    legacy.push({ label: 'Promo',        value: card.promo_text });
  return legacy;
}

function resolveCardLayout(cardStyle: string | undefined): CardLayout {
  if (!cardStyle) return 'grid';
  if (cardStyle.includes('list'))     return 'list';
  if (cardStyle.includes('carousel')) return 'carousel';
  return 'grid';
}

function resolveGridCols(cardStyle: string | undefined): string {
  if (cardStyle?.includes('four')) return 'repeat(auto-fill, minmax(220px, 1fr))';
  if (cardStyle?.includes('two'))  return 'repeat(auto-fill, minmax(300px, 1fr))';
  return 'repeat(auto-fill, minmax(260px, 1fr))';
}

/* ─── Single Card ─────────────────────────────────────────── */

function PartnerCard({ card }: { card: PartnerCard }) {
  const hasCta = card.telegram_url || card.whatsapp_url || card.website_url;
  const bonusItems = resolveBonusItems(card);

  return (
    <article
      style={{
        background:    'var(--pb-bg-card, #27272a)',
        border:        '1px solid var(--pb-border-card, rgba(255,255,255,0.06))',
        borderRadius:  'var(--pb-radius-card, 12px)',
        boxShadow:     'var(--pb-shadow-card, 0 2px 12px rgba(0,0,0,0.3))',
        overflow:      'hidden',
        display:       'flex',
        flexDirection: 'column',
        position:      'relative',
        transition:    `transform var(--pb-duration-base, 0.2s), box-shadow var(--pb-duration-base, 0.2s)`,
      }}
    >
      {/* Badge — corner overlay, never over the logo area */}
      {card.badge && (
        <div style={{
          position:     'absolute',
          top:          '8px',
          right:        '8px',
          background:   'var(--pb-accent, #f59e0b)',
          color:        '#000',
          fontSize:     '10px',
          fontWeight:   '700',
          padding:      '2px 8px',
          borderRadius: '9999px',
          textTransform:'uppercase',
          letterSpacing:'0.05em',
          zIndex:       2,
        }}>
          {card.badge}
        </div>
      )}

      {/* Logo Area — big, always transparent, never cropped/stretched.
          Extra top padding reserves clearance so a wide/square logo can
          never grow up into the badge's top-right corner. */}
      <div className="pb-card-logo-area" style={{
        display:       'flex',
        alignItems:    'center',
        justifyContent:'center',
        width:         '100%',
        background:    'transparent',
        padding:       '32px 16px 16px',
        boxSizing:     'border-box',
        flexShrink:    0,
      }}>
        {card.logo_url ? (
          <img
            src={card.logo_url}
            alt={card.brand_name}
            loading="lazy"
            style={{
              maxWidth:       '90%',
              maxHeight:      '90%',
              width:          'auto',
              height:         'auto',
              objectFit:      'contain',
              objectPosition: 'center',
            }}
          />
        ) : (
          <div style={{
            width:         '56px',
            height:        '56px',
            borderRadius:  '50%',
            background:    'var(--pb-bg-section, #18181b)',
            border:        '1px solid var(--pb-border-card, rgba(255,255,255,0.06))',
            display:       'flex',
            alignItems:    'center',
            justifyContent:'center',
            fontWeight:    '800',
            fontSize:      '20px',
            color:         'var(--pb-text-primary, #f4f4f5)',
          }}>
            {card.brand_name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info + CTA */}
      <div style={{
        padding:      '4px 14px 14px',
        flex:         1,
        display:      'flex',
        flexDirection:'column',
        textAlign:    'center',
      }}>
        <h3 style={{
          margin:      0,
          fontSize:    '15px',
          fontWeight:  '700',
          color:       'var(--pb-text-primary, #f4f4f5)',
          overflow:    'hidden',
          textOverflow:'ellipsis',
          whiteSpace:  'nowrap',
        }}>
          {card.brand_name}
        </h3>
        {card.subtitle && (
          <p style={{
            margin:      '2px 0 0',
            fontSize:    '11px',
            color:       'var(--pb-text-muted, rgba(255,255,255,0.5))',
            overflow:    'hidden',
            textOverflow:'ellipsis',
            whiteSpace:  'nowrap',
          }}>
            {card.subtitle}
          </p>
        )}

        {card.description && (
          <p style={{
            margin:         '6px 0 0',
            fontSize:       '12px',
            color:          'var(--pb-text-muted, rgba(255,255,255,0.6))',
            lineHeight:     '1.4',
            display:        '-webkit-box',
            WebkitLineClamp:2,
            WebkitBoxOrient:'vertical',
            overflow:       'hidden',
          }}>
            {card.description}
          </p>
        )}

        {bonusItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            {bonusItems.map((item, i) => (
              <BonusRow key={i} label={item.label} value={item.value} />
            ))}
          </div>
        )}

        {/* CTA Buttons — Telegram / WhatsApp / Website, fully independent, stacked to fit compact cards */}
        {hasCta && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
            {card.telegram_url && (
              <a href={card.telegram_url} target="_blank" rel="noopener noreferrer" style={primaryBtnStyle(card)}>
                {card.button_text || 'Join Now'}
              </a>
            )}
            {card.whatsapp_url && (
              <a href={card.whatsapp_url} target="_blank" rel="noopener noreferrer" style={whatsappBtnStyle}>
                WhatsApp
              </a>
            )}
            {card.website_url && (
              <a href={card.website_url} target="_blank" rel="noopener noreferrer" style={websiteBtnStyle}>
                Visit Site
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function BonusRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{
          fontSize:    '11px',
          lineHeight:  '1.3',
          color:       'var(--pb-text-muted, rgba(255,255,255,0.5))',
          overflow:    'hidden',
          textOverflow:'ellipsis',
          whiteSpace:  'nowrap',
        }}>
          {label}
        </span>
        <span style={{
          fontSize:       '13px',
          fontWeight:     '700',
          lineHeight:     '1.3',
          color:          'var(--pb-accent, #f59e0b)',
          display:        '-webkit-box',
          WebkitLineClamp:2,
          WebkitBoxOrient:'vertical',
          overflow:       'hidden',
          wordBreak:      'break-word',
        }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function ctaBtnBase(): React.CSSProperties {
  return {
    display:       'flex',
    alignItems:    'center',
    justifyContent:'center',
    width:         '100%',
    padding:       '9px 10px',
    borderRadius:  'var(--pb-radius-btn, 6px)',
    textDecoration:'none',
    fontSize:      '13px',
    fontWeight:    '600',
    boxSizing:     'border-box',
    transition:    `opacity var(--pb-duration-base, 0.2s)`,
  };
}

const whatsappBtnStyle: React.CSSProperties = {
  ...ctaBtnBase(),
  background: '#25D366',
  color:      '#fff',
  border:     '1px solid #25D366',
};

const websiteBtnStyle: React.CSSProperties = {
  ...ctaBtnBase(),
  border:     '1px solid var(--pb-btn-outline-color, var(--pb-primary, #7c3aed))',
  color:      'var(--pb-btn-outline-color, var(--pb-primary, #7c3aed))',
  background: 'transparent',
};

function primaryBtnStyle(card: PartnerCard): React.CSSProperties {
  const bg        = card.button_color ?? 'var(--pb-btn-bg, var(--pb-primary, #7c3aed))';
  const isOutline = card.button_style === 'outline';
  return {
    ...ctaBtnBase(),
    background: isOutline ? 'transparent' : bg,
    color:      isOutline ? bg : 'var(--pb-btn-text, #fff)',
    border:     `1px solid ${bg}`,
  };
}

/* ─── Card Grid / List / Carousel ────────────────────────── */

// Shared by every layout mode — the big transparent logo area (130px mobile,
// 180px from 768px up). Kept as one constant so list/carousel/grid all agree.
const LOGO_AREA_STYLES = `
  .pb-card-logo-area { height: 130px; }
  @media (min-width: 768px) {
    .pb-card-logo-area { height: 180px; }
  }
`;

export function PartnerCardGrid({ cards, layout_json }: { cards: PartnerCard[]; layout_json: LayoutJson }) {
  if (cards.length === 0) return null;

  const layoutMode = resolveCardLayout(layout_json.cardStyle);

  if (layoutMode === 'list') {
    return (
      <>
        <style>{LOGO_AREA_STYLES}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pb-card-gap, 16px)' }}>
          {cards.map(c => <PartnerCard key={c.id} card={c} />)}
        </div>
      </>
    );
  }

  if (layoutMode === 'carousel') {
    return (
      <>
        <style>{`
          ${LOGO_AREA_STYLES}
          .pb-carousel { display: flex; gap: var(--pb-card-gap, 16px); overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding-bottom: 8px; }
          .pb-carousel::-webkit-scrollbar { height: 4px; }
          .pb-carousel::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
          .pb-carousel::-webkit-scrollbar-thumb { background: var(--pb-primary, #7c3aed); border-radius: 2px; }
          .pb-carousel > article { min-width: 260px; max-width: 300px; scroll-snap-align: start; }
          @media (min-width: 768px) {
            .pb-carousel { display: grid; grid-template-columns: ${resolveGridCols(layout_json.cardStyle)}; overflow-x: visible; }
            .pb-carousel > article { min-width: unset; max-width: unset; }
          }
        `}</style>
        <div className="pb-carousel">
          {cards.map(c => <PartnerCard key={c.id} card={c} />)}
        </div>
      </>
    );
  }

  // Default grid — MR Coin style: 2 columns on mobile, 3 from 768px, 4 from 1280px
  // when the container is wide enough. Fixed column counts (not auto-fill/minmax)
  // so mobile reliably gets 2-up instead of collapsing to 1 column.
  return (
    <>
      <style>{`
        ${LOGO_AREA_STYLES}
        .pb-partner-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        @media (min-width: 768px) {
          .pb-partner-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--pb-card-gap, 16px); }
        }
        @media (min-width: 1280px) {
          .pb-partner-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
      `}</style>
      <div className="pb-partner-grid">
        {cards.map(c => <PartnerCard key={c.id} card={c} />)}
      </div>
    </>
  );
}
