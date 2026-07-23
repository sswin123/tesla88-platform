import React from 'react';
import type { PartnerCard, LayoutJson } from './index';

/* ─── Layout resolver ────────────────────────────────────── */

type CardLayout = 'grid' | 'list' | 'carousel';

function resolveCardLayout(cardStyle: string | undefined): CardLayout {
  if (!cardStyle) return 'grid';
  if (cardStyle.includes('list')) return 'list';
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
  const primaryCta = card.telegram_url ?? card.whatsapp_url ?? card.website_url;

  return (
    <article
      style={{
        background:   'var(--pb-card-bg, var(--pb-surface, #18181b))',
        border:       '1px solid var(--pb-card-border, rgba(255,255,255,0.08))',
        borderRadius: '12px',
        overflow:     'hidden',
        display:      'flex',
        flexDirection:'column',
        position:     'relative',
        transition:   'transform 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Badge */}
      {card.badge && (
        <div style={{
          position:   'absolute',
          top:        '10px',
          right:      '10px',
          background: 'var(--pb-accent, #f59e0b)',
          color:      '#000',
          fontSize:   '10px',
          fontWeight: '700',
          padding:    '2px 8px',
          borderRadius:'9999px',
          textTransform:'uppercase',
          letterSpacing:'0.05em',
          zIndex:     1,
        }}>
          {card.badge}
        </div>
      )}

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, var(--pb-primary, #7c3aed)30, var(--pb-bg, #09090b))',
        padding:    '20px',
        display:    'flex',
        alignItems: 'center',
        gap:        '12px',
        borderBottom: '1px solid var(--pb-card-border, rgba(255,255,255,0.06))',
      }}>
        {/* Logo */}
        <div style={{
          width:        '48px',
          height:       '48px',
          borderRadius: '10px',
          background:   'var(--pb-primary, #7c3aed)',
          display:      'flex',
          alignItems:   'center',
          justifyContent:'center',
          flexShrink:   0,
          overflow:     'hidden',
          fontWeight:   '800',
          fontSize:     '20px',
          color:        '#fff',
        }}>
          {card.logo_url ? (
            <img
              src={card.logo_url}
              alt={card.brand_name}
              width="48"
              height="48"
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            card.brand_name.charAt(0).toUpperCase()
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{
            margin:     0,
            fontSize:   '16px',
            fontWeight: '700',
            color:      'var(--pb-text, #f4f4f5)',
            overflow:   'hidden',
            textOverflow:'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {card.brand_name}
          </h3>
          {card.subtitle && (
            <p style={{
              margin:   '2px 0 0',
              fontSize: '12px',
              color:    'var(--pb-text-muted, rgba(255,255,255,0.5))',
              overflow: 'hidden',
              textOverflow:'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {card.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Bonus Info */}
      <div style={{ padding: '14px 20px', flex: 1 }}>
        {card.description && (
          <p style={{
            margin:     '0 0 10px',
            fontSize:   '13px',
            color:      'var(--pb-text-muted, rgba(255,255,255,0.6))',
            lineHeight: '1.5',
          }}>
            {card.description}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {card.welcome_bonus && (
            <BonusRow icon="🎁" label="Welcome Bonus" value={card.welcome_bonus} />
          )}
          {card.free_credit && (
            <BonusRow icon="💰" label="Free Credit" value={card.free_credit} />
          )}
          {card.commission && (
            <BonusRow icon="📈" label="Commission" value={card.commission} />
          )}
          {card.promo_text && (
            <BonusRow icon="⚡" label="Promo" value={card.promo_text} />
          )}
        </div>
      </div>

      {/* CTA Buttons */}
      {hasCta && (
        <div style={{
          padding:    '12px 16px 16px',
          display:    'flex',
          gap:        '8px',
          flexWrap:   'wrap',
        }}>
          {card.telegram_url && (
            <a
              href={card.telegram_url}
              target="_blank"
              rel="noopener noreferrer"
              style={primaryBtnStyle(card)}
            >
              {card.button_text || 'Join Now'}
            </a>
          )}
          {card.whatsapp_url && !card.telegram_url && (
            <a
              href={card.whatsapp_url}
              target="_blank"
              rel="noopener noreferrer"
              style={primaryBtnStyle(card)}
            >
              {card.button_text || 'Join Now'}
            </a>
          )}
          {card.website_url && (
            <a
              href={card.website_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex:           '1',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                padding:        '8px 12px',
                borderRadius:   '8px',
                textDecoration: 'none',
                fontSize:       '13px',
                fontWeight:     '600',
                border:         '1px solid var(--pb-primary, #7c3aed)',
                color:          'var(--pb-primary, #7c3aed)',
                background:     'transparent',
                transition:     'background 0.2s',
              }}
            >
              Visit Site
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function BonusRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
      <span style={{ fontSize: '14px', flexShrink: 0 }}>{icon}</span>
      <span style={{ color: 'var(--pb-text-muted, rgba(255,255,255,0.5))', flexShrink: 0 }}>{label}:</span>
      <span style={{ color: 'var(--pb-accent, #f59e0b)', fontWeight: '600' }}>{value}</span>
    </div>
  );
}

function primaryBtnStyle(card: PartnerCard): React.CSSProperties {
  const bg      = card.button_color ?? 'var(--pb-btn-primary-bg, var(--pb-primary, #7c3aed))';
  const isOutline = card.button_style === 'outline';
  return {
    flex:           '1',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '9px 14px',
    borderRadius:   '8px',
    textDecoration: 'none',
    fontSize:       '13px',
    fontWeight:     '700',
    background:     isOutline ? 'transparent' : bg,
    color:          isOutline ? bg : 'var(--pb-btn-primary-fg, #fff)',
    border:         `1px solid ${bg}`,
    transition:     'opacity 0.2s',
    minWidth:       '100px',
  };
}

/* ─── Card Grid / List / Carousel ────────────────────────── */

export function PartnerCardGrid({ cards, layout_json }: { cards: PartnerCard[]; layout_json: LayoutJson }) {
  if (cards.length === 0) return null;

  const layoutMode = resolveCardLayout(layout_json.cardStyle);

  /* List layout: single column */
  if (layoutMode === 'list') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {cards.map(c => <PartnerCard key={c.id} card={c} />)}
      </div>
    );
  }

  /* Carousel layout: horizontal scroll on mobile, grid on desktop */
  if (layoutMode === 'carousel') {
    return (
      <>
        <style>{`
          .pb-carousel { display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding-bottom: 8px; }
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

  /* Grid layout (default) */
  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: resolveGridCols(layout_json.cardStyle),
      gap:                 '16px',
    }}>
      {cards.map(c => <PartnerCard key={c.id} card={c} />)}
    </div>
  );
}
