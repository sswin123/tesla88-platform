import { notFound }               from 'next/navigation';
import type { Metadata }          from 'next';
import { getPartnerPage }         from '@/lib/partner-render';
import { buildThemeCss }          from '@/lib/partner-render/theme-engine';
import { generatePartnerMetadata } from '@/lib/partner-render/seo';
import { renderSections }         from '@/lib/partner-render/section-engine';

/* ─── ISR: re-render at most every 60 s; revalidateTag() for on-demand ── */
export const revalidate    = 60;
export const dynamicParams = true;

/* ─── Types ──────────────────────────────────────────────── */
type Props = { params: Promise<{ slug: string }> };

/* ─── Metadata ───────────────────────────────────────────── */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPartnerPage(slug);
  if (!data) return { title: 'Not Found' };

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? process.env.WEBSITE_URL
    ?? 'https://apidemo.club';

  return generatePartnerMetadata(data.site, baseUrl);
}

/* ─── Page ───────────────────────────────────────────────── */
export default async function PartnerPage({ params }: Props) {
  const { slug } = await params;
  const data     = await getPartnerPage(slug);

  /* 404: not found, draft, archived, or missing template/theme */
  if (!data) notFound();

  const { theme } = data;
  const themeCss  = buildThemeCss(theme.css_variables ?? {});
  const sections  = renderSections(data);

  return (
    <>
      {/* Inline theme CSS — no external stylesheets, zero render-blocking */}
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />

      {/* Responsive base styles */}
      <style>{`
        html { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-text-size-adjust: 100%; }
        a { color: inherit; }
        img { max-width: 100%; height: auto; }
        @media (max-width: 640px) {
          h1 { font-size: 28px !important; }
        }
      `}</style>

      {/* Page wrapper */}
      <div
        style={{
          minHeight:  '100vh',
          background: 'var(--pb-bg, #09090b)',
          color:      'var(--pb-text, #f4f4f5)',
        }}
      >
        {/* Minimal nav bar */}
        <nav style={{
          position:     'sticky',
          top:          0,
          zIndex:       100,
          background:   'var(--pb-header-bg, var(--pb-surface, #18181b))',
          borderBottom: '1px solid var(--pb-border, rgba(255,255,255,0.06))',
          backdropFilter:'blur(12px)',
          WebkitBackdropFilter:'blur(12px)',
          padding:      '0 20px',
        }}>
          <div style={{
            maxWidth:   '1200px',
            margin:     '0 auto',
            height:     '56px',
            display:    'flex',
            alignItems: 'center',
            justifyContent:'space-between',
            gap:        '12px',
          }}>
            {data.site.logo_url ? (
              <img
                src={data.site.logo_url}
                alt={data.site.name}
                height="32"
                style={{ maxHeight: '32px', objectFit: 'contain' }}
              />
            ) : (
              <span style={{ fontWeight: '800', fontSize: '17px', color: 'var(--pb-primary, #7c3aed)' }}>
                {data.site.name}
              </span>
            )}
            <a
              href="#partners"
              style={{
                padding:        '7px 18px',
                borderRadius:   '8px',
                background:     'var(--pb-btn-primary-bg, var(--pb-primary, #7c3aed))',
                color:          'var(--pb-btn-primary-fg, #fff)',
                textDecoration: 'none',
                fontSize:       '13px',
                fontWeight:     '700',
              }}
            >
              View Partners
            </a>
          </div>
        </nav>

        {/* Main content: sections rendered by the engine */}
        <main>
          {sections}
        </main>
      </div>
    </>
  );
}
