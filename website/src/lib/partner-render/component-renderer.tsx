/**
 * Component Renderer
 * ─────────────────
 * Provides reusable renderXxx() functions for each section type.
 * Each function reads layout_json to determine the visual variant.
 * Styling is entirely CSS-variable-driven (var(--pb-*)) — never hardcoded per-template.
 */

import React from 'react';
import type { PartnerPageData, PartnerSection, LayoutJson } from './index';
import { PartnerCardGrid } from './card-renderer';

type Ctx = {
  data:    PartnerPageData;
  section: PartnerSection;
  layout:  LayoutJson;
};

/* ── Hero ────────────────────────────────────────────────── */
export function renderHero({ data, layout }: Ctx): React.ReactElement {
  const { site, cards } = data;
  const style           = layout.heroStyle ?? 'hero-simple';
  const isCinematic     = style.includes('cinematic') || style.includes('video');
  const spacing         = layout.spacing === 'tight' ? '40px 20px' : layout.spacing === 'spacious' ? '100px 20px' : '64px 20px';

  const primaryCta = cards.find(c => c.telegram_url || c.whatsapp_url || c.website_url);
  const ctaHref    = primaryCta?.telegram_url ?? primaryCta?.whatsapp_url ?? primaryCta?.website_url ?? '#partners';
  const ctaText    = primaryCta ? (primaryCta.button_text || 'Join Now') : 'Get Started';

  return (
    <section
      id="hero"
      style={{
        background:     isCinematic
          ? 'linear-gradient(135deg, var(--pb-bg, #09090b) 0%, var(--pb-primary, #7c3aed)20 50%, var(--pb-bg, #09090b) 100%)'
          : 'linear-gradient(180deg, var(--pb-surface, #18181b) 0%, var(--pb-bg, #09090b) 100%)',
        padding:        spacing,
        textAlign:      'center',
        position:       'relative',
        overflow:       'hidden',
        borderBottom:   '1px solid var(--pb-border, rgba(255,255,255,0.06))',
      }}
    >
      {/* Decorative glow */}
      {isCinematic && (
        <div style={{
          position:   'absolute',
          top:        '-40%',
          left:       '50%',
          transform:  'translateX(-50%)',
          width:      '600px',
          height:     '600px',
          borderRadius:'50%',
          background: 'var(--pb-primary, #7c3aed)',
          opacity:    0.06,
          filter:     'blur(80px)',
          pointerEvents:'none',
        }} />
      )}

      <div style={{ position: 'relative', maxWidth: '680px', margin: '0 auto' }}>
        {/* Logo */}
        {site.logo_url && (
          <div style={{ marginBottom: '20px' }}>
            <img
              src={site.logo_url}
              alt={site.name}
              height="60"
              style={{ maxHeight: '60px', objectFit: 'contain' }}
            />
          </div>
        )}

        <h1 style={{
          margin:       '0 0 16px',
          fontSize:     'clamp(28px, 5vw, 48px)',
          fontWeight:   '800',
          lineHeight:   '1.15',
          color:        'var(--pb-text, #f4f4f5)',
          letterSpacing:'-0.02em',
        }}>
          {site.name}
        </h1>

        {site.meta_description && (
          <p style={{
            margin:   '0 0 32px',
            fontSize: 'clamp(14px, 2vw, 18px)',
            color:    'var(--pb-text-muted, rgba(255,255,255,0.6))',
            lineHeight:'1.6',
          }}>
            {site.meta_description}
          </p>
        )}

        {/* CTA Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href={ctaHref}
            target={ctaHref.startsWith('http') ? '_blank' : undefined}
            rel={ctaHref.startsWith('http') ? 'noopener noreferrer' : undefined}
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '8px',
              padding:        '14px 32px',
              borderRadius:   '10px',
              textDecoration: 'none',
              fontSize:       '15px',
              fontWeight:     '700',
              background:     'var(--pb-btn-primary-bg, var(--pb-primary, #7c3aed))',
              color:          'var(--pb-btn-primary-fg, #fff)',
              boxShadow:      '0 4px 20px var(--pb-primary, #7c3aed)40',
              transition:     'opacity 0.2s, transform 0.2s',
            }}
          >
            {ctaText}
          </a>
          <a
            href="#partners"
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '8px',
              padding:        '14px 32px',
              borderRadius:   '10px',
              textDecoration: 'none',
              fontSize:       '15px',
              fontWeight:     '600',
              border:         '1px solid var(--pb-primary, #7c3aed)',
              color:          'var(--pb-primary, #7c3aed)',
              background:     'transparent',
            }}
          >
            View Partners
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── Marquee ─────────────────────────────────────────────── */
export function renderMarquee({ data }: Ctx): React.ReactElement {
  const { cards } = data;
  const items     = [...cards, ...cards]; // duplicate for seamless loop

  return (
    <div
      aria-hidden="true"
      style={{
        overflow:   'hidden',
        borderTop:  '1px solid var(--pb-border, rgba(255,255,255,0.06))',
        borderBottom:'1px solid var(--pb-border, rgba(255,255,255,0.06))',
        padding:    '12px 0',
        background: 'var(--pb-surface, #18181b)',
      }}
    >
      <div style={{
        display:   'flex',
        width:     'fit-content',
        animation: 'pb-marquee 30s linear infinite',
        gap:       '32px',
      }}>
        {items.map((c, i) => (
          <div
            key={`${c.id}-${i}`}
            style={{
              display:     'flex',
              alignItems:  'center',
              gap:         '8px',
              whiteSpace:  'nowrap',
              fontSize:    '13px',
              fontWeight:  '600',
              color:       'var(--pb-text-muted, rgba(255,255,255,0.5))',
            }}
          >
            <span style={{
              width:        '8px',
              height:       '8px',
              borderRadius: '50%',
              background:   'var(--pb-primary, #7c3aed)',
              flexShrink:   0,
            }} />
            {c.brand_name}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Partners (cards) ────────────────────────────────────── */
export function renderPartners({ data, layout }: Ctx): React.ReactElement {
  const { cards, site } = data;

  return (
    <section
      id="partners"
      style={{
        maxWidth:  '1200px',
        margin:    '0 auto',
        padding:   `${layout.spacing === 'tight' ? '32px' : '56px'} 20px`,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{
          display:     'inline-block',
          fontSize:    '11px',
          fontWeight:  '700',
          letterSpacing:'0.1em',
          textTransform:'uppercase',
          color:        'var(--pb-accent, #f59e0b)',
          marginBottom: '8px',
        }}>
          Partner Brands
        </div>
        <h2 style={{
          margin:      0,
          fontSize:    'clamp(22px, 3vw, 32px)',
          fontWeight:  '700',
          color:       'var(--pb-text, #f4f4f5)',
        }}>
          Choose Your Platform
        </h2>
        <p style={{
          margin:   '8px 0 0',
          fontSize: '14px',
          color:    'var(--pb-text-muted, rgba(255,255,255,0.5))',
        }}>
          All platforms are verified and trusted
        </p>
      </div>
      <PartnerCardGrid cards={cards} layout_json={layout} />
    </section>
  );
}

/* ── Promotions ──────────────────────────────────────────── */
export function renderPromotions({ section }: Ctx): React.ReactElement {
  const content = section.content_json ?? {};
  const title   = (content.title as string) ?? 'Exclusive Promotions';
  const items   = (content.items as Array<{ title: string; desc: string; badge?: string }>) ?? [];

  return (
    <section
      id="promotions"
      style={{
        background: 'var(--pb-surface, #18181b)',
        borderTop:  '1px solid var(--pb-border, rgba(255,255,255,0.06))',
        borderBottom:'1px solid var(--pb-border, rgba(255,255,255,0.06))',
        padding:    '48px 20px',
      }}
    >
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <h2 style={{
          textAlign:  'center',
          margin:     '0 0 32px',
          fontSize:   'clamp(20px, 3vw, 28px)',
          fontWeight: '700',
          color:      'var(--pb-text, #f4f4f5)',
        }}>
          {title}
        </h2>

        {items.length > 0 ? (
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap:                 '16px',
          }}>
            {items.map((item, i) => (
              <div key={i} style={{
                background:   'var(--pb-bg, #09090b)',
                border:       '1px solid var(--pb-border, rgba(255,255,255,0.08))',
                borderRadius: '10px',
                padding:      '20px',
              }}>
                {item.badge && (
                  <span style={{
                    display:       'inline-block',
                    background:    'var(--pb-accent, #f59e0b)',
                    color:         '#000',
                    fontSize:      '10px',
                    fontWeight:    '700',
                    padding:       '2px 8px',
                    borderRadius:  '9999px',
                    marginBottom:  '10px',
                    textTransform: 'uppercase',
                  }}>
                    {item.badge}
                  </span>
                )}
                <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '700', color: 'var(--pb-text, #f4f4f5)' }}>
                  {item.title}
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--pb-text-muted, rgba(255,255,255,0.5))' }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        ) : (
          /* Placeholder when no custom promo content */
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap:                 '16px',
          }}>
            {[
              { badge: 'NEW', title: 'Welcome Bonus', desc: 'Up to 100% on your first deposit. Terms apply.' },
              { badge: 'HOT', title: 'Daily Cashback', desc: 'Get cash back on every bet, every day.' },
              { badge: null,  title: 'Referral Bonus', desc: 'Earn rewards for every friend you refer.' },
            ].map((p, i) => (
              <div key={i} style={{
                background:   'var(--pb-bg, #09090b)',
                border:       '1px solid var(--pb-border, rgba(255,255,255,0.08))',
                borderRadius: '10px',
                padding:      '20px',
              }}>
                {p.badge && (
                  <span style={{
                    display: 'inline-block',
                    background: 'var(--pb-accent, #f59e0b)',
                    color: '#000', fontSize: '10px', fontWeight: '700',
                    padding: '2px 8px', borderRadius: '9999px',
                    marginBottom: '10px', textTransform: 'uppercase',
                  }}>
                    {p.badge}
                  </span>
                )}
                <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '700', color: 'var(--pb-text, #f4f4f5)' }}>
                  {p.title}
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--pb-text-muted, rgba(255,255,255,0.5))' }}>
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Contact / CTA ───────────────────────────────────────── */
export function renderContact({ data, section }: Ctx): React.ReactElement {
  const content      = section.content_json ?? {};
  const title        = (content.title as string)   ?? 'Contact Us';
  const subtitle     = (content.subtitle as string) ?? 'Reach out through any of these channels';
  const telegramUrl  = (content.telegram_url as string)  ?? null;
  const whatsappUrl  = (content.whatsapp_url as string)  ?? null;
  const lineUrl      = (content.line_url as string)      ?? null;

  /* Fall back to first card's contact links */
  const firstCard = data.cards[0];
  const tg  = telegramUrl  ?? firstCard?.telegram_url  ?? null;
  const wa  = whatsappUrl  ?? firstCard?.whatsapp_url  ?? null;
  const web = lineUrl      ?? firstCard?.website_url   ?? null;

  return (
    <section
      id="contact"
      style={{
        padding:   '56px 20px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: '700', color: 'var(--pb-text, #f4f4f5)' }}>
          {title}
        </h2>
        <p style={{ margin: '0 0 32px', fontSize: '14px', color: 'var(--pb-text-muted, rgba(255,255,255,0.5))' }}>
          {subtitle}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {tg && (
            <a href={tg} target="_blank" rel="noopener noreferrer" style={ctaBtnStyle('#0088cc')}>
              📱 Telegram
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" style={ctaBtnStyle('#25d366')}>
              💬 WhatsApp
            </a>
          )}
          {web && (
            <a href={web} target="_blank" rel="noopener noreferrer" style={ctaBtnStyle('var(--pb-primary, #7c3aed)')}>
              🌐 Website
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function ctaBtnStyle(bg: string): React.CSSProperties {
  return {
    display:        'inline-flex',
    alignItems:     'center',
    gap:            '6px',
    padding:        '12px 24px',
    borderRadius:   '10px',
    textDecoration: 'none',
    fontSize:       '14px',
    fontWeight:     '700',
    background:     bg,
    color:          '#fff',
    transition:     'opacity 0.2s',
  };
}

/* ── Footer ──────────────────────────────────────────────── */
export function renderFooter({ data, layout }: Ctx): React.ReactElement {
  const { site } = data;
  const footerStyle = layout.footerStyle ?? 'footer-dark';
  const isDark = !footerStyle.includes('light');

  return (
    <footer
      style={{
        background:  isDark
          ? 'var(--pb-footer-bg, var(--pb-surface, #18181b))'
          : 'var(--pb-footer-bg, #f9fafb)',
        borderTop:   '1px solid var(--pb-border, rgba(255,255,255,0.06))',
        padding:     '32px 20px',
        textAlign:   'center',
      }}
    >
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Brand */}
        <div style={{ marginBottom: '16px' }}>
          {site.logo_url ? (
            <img src={site.logo_url} alt={site.name} height="32" style={{ maxHeight: '32px', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--pb-primary, #7c3aed)' }}>
              {site.name}
            </span>
          )}
        </div>

        {/* Disclaimer */}
        <p style={{
          fontSize:   '11px',
          color:      isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
          maxWidth:   '600px',
          margin:     '0 auto 12px',
          lineHeight: '1.6',
        }}>
          This page is intended for users 18 years and above. Please gamble responsibly.
        </p>

        <p style={{
          margin:   0,
          fontSize: '12px',
          color:    isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)',
        }}>
          © {new Date().getFullYear()} {site.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
