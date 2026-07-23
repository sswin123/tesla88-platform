/**
 * Component Renderer — Phase M5-D
 * All styling uses the canonical --pb-* CSS variable system.
 * See theme-defaults.ts for the full 43-variable reference.
 * Never hardcode colors, radii, or durations — always use var(--pb-*).
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
  const style       = layout.heroStyle ?? 'hero-simple';
  const isCinematic = style.includes('cinematic') || style.includes('video');

  const primaryCta = cards.find(c => c.telegram_url || c.whatsapp_url || c.website_url);
  const ctaHref    = primaryCta?.telegram_url ?? primaryCta?.whatsapp_url ?? primaryCta?.website_url ?? '#partners';
  const ctaText    = primaryCta ? (primaryCta.button_text || 'Join Now') : 'Get Started';

  return (
    <section
      id="hero"
      style={{
        background:   isCinematic
          ? 'linear-gradient(135deg, var(--pb-bg-page, #09090b) 0%, color-mix(in srgb, var(--pb-primary, #7c3aed) 20%, transparent) 50%, var(--pb-bg-page, #09090b) 100%)'
          : 'linear-gradient(180deg, var(--pb-bg-section, #18181b) 0%, var(--pb-bg-page, #09090b) 100%)',
        padding:      'var(--pb-section-py, 64px) var(--pb-section-px, 20px)',
        minHeight:    'var(--pb-hero-min-height, 480px)',
        textAlign:    'center',
        position:     'relative',
        overflow:     'hidden',
        borderBottom: '1px solid var(--pb-border, rgba(255,255,255,0.06))',
        display:      'flex',
        flexDirection:'column',
        justifyContent:'center',
      }}
    >
      {/* Decorative glow */}
      {isCinematic && (
        <div style={{
          position:    'absolute',
          top:         '-40%',
          left:        '50%',
          transform:   'translateX(-50%)',
          width:       '600px',
          height:      '600px',
          borderRadius:'50%',
          background:  'var(--pb-primary, #7c3aed)',
          opacity:     0.06,
          filter:      'blur(80px)',
          pointerEvents:'none',
        }} />
      )}

      <div style={{
        position: 'relative',
        maxWidth: '680px',
        margin:   '0 auto',
        width:    '100%',
      }}>
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
          margin:        '0 0 16px',
          fontSize:      'clamp(28px, 5vw, 48px)',
          fontWeight:    'var(--pb-font-weight-heading, 700)',
          fontFamily:    'var(--pb-font-display)',
          lineHeight:    '1.15',
          color:         'var(--pb-text-primary, #f4f4f5)',
          letterSpacing: 'var(--pb-letter-spacing-heading, -0.02em)',
        }}>
          {site.name}
        </h1>

        {site.meta_description && (
          <p style={{
            margin:    '0 0 32px',
            fontSize:  'clamp(14px, 2vw, 18px)',
            color:     'var(--pb-text-muted, rgba(255,255,255,0.6))',
            lineHeight:'var(--pb-line-height, 1.6)',
          }}>
            {site.meta_description}
          </p>
        )}

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
              borderRadius:   'var(--pb-radius-btn, 6px)',
              textDecoration: 'none',
              fontSize:       '15px',
              fontWeight:     '700',
              background:     'var(--pb-btn-bg, var(--pb-primary, #7c3aed))',
              color:          'var(--pb-btn-text, #fff)',
              boxShadow:      'var(--pb-shadow-glow, 0 0 24px rgba(124,58,237,0.2))',
              transition:     'opacity var(--pb-duration-base, 0.2s), transform var(--pb-duration-base, 0.2s)',
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
              borderRadius:   'var(--pb-radius-btn, 6px)',
              textDecoration: 'none',
              fontSize:       '15px',
              fontWeight:     '600',
              border:         '1px solid var(--pb-btn-outline-color, var(--pb-primary, #7c3aed))',
              color:          'var(--pb-btn-outline-color, var(--pb-primary, #7c3aed))',
              background:     'transparent',
              transition:     'background var(--pb-duration-base, 0.2s)',
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
  const items     = [...cards, ...cards];

  return (
    <div
      aria-hidden="true"
      style={{
        overflow:    'hidden',
        borderTop:   '1px solid var(--pb-border, rgba(255,255,255,0.06))',
        borderBottom:'1px solid var(--pb-border, rgba(255,255,255,0.06))',
        padding:     '12px 0',
        background:  'var(--pb-bg-section, #18181b)',
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
              display:    'flex',
              alignItems: 'center',
              gap:        '8px',
              whiteSpace: 'nowrap',
              fontSize:   '13px',
              fontWeight: '600',
              color:      'var(--pb-text-muted, rgba(255,255,255,0.5))',
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

/* ── Partners (card grid) ────────────────────────────────── */
export function renderPartners({ data, layout }: Ctx): React.ReactElement {
  const { cards } = data;

  return (
    <section
      id="partners"
      style={{
        maxWidth: 'var(--pb-container-width, 1200px)',
        margin:   '0 auto',
        padding:  `var(--pb-section-py, 64px) var(--pb-section-px, 20px)`,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{
          display:      'inline-block',
          fontSize:     '11px',
          fontWeight:   '700',
          letterSpacing:'0.1em',
          textTransform:'uppercase',
          color:        'var(--pb-accent, #f59e0b)',
          marginBottom: '8px',
        }}>
          Partner Brands
        </div>
        <h2 style={{
          margin:        0,
          fontSize:      'clamp(22px, 3vw, 32px)',
          fontWeight:    'var(--pb-font-weight-heading, 700)',
          fontFamily:    'var(--pb-font-display)',
          color:         'var(--pb-text-primary, #f4f4f5)',
          letterSpacing: 'var(--pb-letter-spacing-heading, -0.02em)',
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

  const defaultPromos = [
    { badge: 'NEW', title: 'Welcome Bonus', desc: 'Up to 100% on your first deposit. Terms apply.' },
    { badge: 'HOT', title: 'Daily Cashback', desc: 'Get cash back on every bet, every day.' },
    { badge: null,  title: 'Referral Bonus', desc: 'Earn rewards for every friend you refer.' },
  ];
  const displayItems = items.length > 0 ? items : defaultPromos;

  return (
    <section
      id="promotions"
      style={{
        background:  'var(--pb-bg-section, #18181b)',
        borderTop:   '1px solid var(--pb-border, rgba(255,255,255,0.06))',
        borderBottom:'1px solid var(--pb-border, rgba(255,255,255,0.06))',
        padding:     `var(--pb-section-py, 64px) var(--pb-section-px, 20px)`,
      }}
    >
      <div style={{
        maxWidth: 'var(--pb-container-width, 1200px)',
        margin:   '0 auto',
      }}>
        <h2 style={{
          textAlign:     'center',
          margin:        '0 0 32px',
          fontSize:      'clamp(20px, 3vw, 28px)',
          fontWeight:    'var(--pb-font-weight-heading, 700)',
          fontFamily:    'var(--pb-font-display)',
          color:         'var(--pb-text-primary, #f4f4f5)',
          letterSpacing: 'var(--pb-letter-spacing-heading, -0.02em)',
        }}>
          {title}
        </h2>

        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap:                 'var(--pb-card-gap, 16px)',
        }}>
          {displayItems.map((item, i) => (
            <div key={i} style={{
              background:   'var(--pb-bg-page, #09090b)',
              border:       '1px solid var(--pb-border-card, rgba(255,255,255,0.06))',
              borderRadius: 'var(--pb-radius-card, 12px)',
              padding:      'var(--pb-card-padding, 20px)',
              boxShadow:    'var(--pb-shadow-card, 0 2px 12px rgba(0,0,0,0.3))',
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
              <h3 style={{
                margin:     '0 0 6px',
                fontSize:   '16px',
                fontWeight: 'var(--pb-font-weight-heading, 700)',
                fontFamily: 'var(--pb-font-display)',
                color:      'var(--pb-text-primary, #f4f4f5)',
              }}>
                {item.title}
              </h3>
              <p style={{
                margin:     0,
                fontSize:   '13px',
                color:      'var(--pb-text-muted, rgba(255,255,255,0.5))',
                lineHeight: 'var(--pb-line-height, 1.6)',
              }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Contact / CTA ───────────────────────────────────────── */
export function renderContact({ data, section }: Ctx): React.ReactElement {
  const content     = section.content_json ?? {};
  const title       = (content.title as string)   ?? 'Contact Us';
  const subtitle    = (content.subtitle as string) ?? 'Reach out through any of these channels';
  const telegramUrl = (content.telegram_url as string) ?? null;
  const whatsappUrl = (content.whatsapp_url as string) ?? null;
  const lineUrl     = (content.line_url as string)     ?? null;

  const firstCard = data.cards[0];
  const tg  = telegramUrl ?? firstCard?.telegram_url ?? null;
  const wa  = whatsappUrl ?? firstCard?.whatsapp_url ?? null;
  const web = lineUrl     ?? firstCard?.website_url  ?? null;

  return (
    <section
      id="contact"
      style={{
        padding:  `var(--pb-section-py, 64px) var(--pb-section-px, 20px)`,
        textAlign:'center',
      }}
    >
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h2 style={{
          margin:        '0 0 8px',
          fontSize:      'clamp(20px, 3vw, 28px)',
          fontWeight:    'var(--pb-font-weight-heading, 700)',
          fontFamily:    'var(--pb-font-display)',
          color:         'var(--pb-text-primary, #f4f4f5)',
          letterSpacing: 'var(--pb-letter-spacing-heading, -0.02em)',
        }}>
          {title}
        </h2>
        <p style={{
          margin:     '0 0 32px',
          fontSize:   '14px',
          color:      'var(--pb-text-muted, rgba(255,255,255,0.5))',
          lineHeight: 'var(--pb-line-height, 1.6)',
        }}>
          {subtitle}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {tg  && <a href={tg}  target="_blank" rel="noopener noreferrer" style={ctaBtnStyle('#0088cc')}>📱 Telegram</a>}
          {wa  && <a href={wa}  target="_blank" rel="noopener noreferrer" style={ctaBtnStyle('#25d366')}>💬 WhatsApp</a>}
          {web && <a href={web} target="_blank" rel="noopener noreferrer" style={ctaBtnStyle('var(--pb-primary, #7c3aed)')}>🌐 Website</a>}
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
    borderRadius:   'var(--pb-radius-btn, 6px)',
    textDecoration: 'none',
    fontSize:       '14px',
    fontWeight:     '700',
    background:     bg,
    color:          '#fff',
    transition:     `opacity var(--pb-duration-base, 0.2s)`,
  };
}

/* ── Footer ──────────────────────────────────────────────── */
export function renderFooter({ data, layout }: Ctx): React.ReactElement {
  const { site } = data;
  const footerStyle = layout.footerStyle ?? 'footer-dark';
  const isDark      = !footerStyle.includes('light');

  return (
    <footer
      style={{
        background: isDark
          ? 'var(--pb-bg-footer, var(--pb-bg-section, #18181b))'
          : 'var(--pb-bg-footer, #f9fafb)',
        borderTop:  '1px solid var(--pb-border, rgba(255,255,255,0.06))',
        padding:    `32px var(--pb-section-px, 20px)`,
        textAlign:  'center',
      }}
    >
      <div style={{
        maxWidth: 'var(--pb-container-width, 1200px)',
        margin:   '0 auto',
      }}>
        <div style={{ marginBottom: '16px' }}>
          {site.logo_url ? (
            <img src={site.logo_url} alt={site.name} height="32" style={{ maxHeight: '32px', objectFit: 'contain' }} />
          ) : (
            <span style={{
              fontSize:   '18px',
              fontWeight: 'var(--pb-font-weight-heading, 700)',
              fontFamily: 'var(--pb-font-display)',
              color:      'var(--pb-primary, #7c3aed)',
            }}>
              {site.name}
            </span>
          )}
        </div>

        <p style={{
          fontSize:   '11px',
          color:      isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
          maxWidth:   '600px',
          margin:     '0 auto 12px',
          lineHeight: 'var(--pb-line-height, 1.6)',
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
