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
        html { -webkit-text-size-adjust: 100%; }
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
          background: 'var(--pb-bg-page, #09090b)',
          color:      'var(--pb-text-primary, #f4f4f5)',
        }}
      >
        {/* Main content: sections rendered by the engine.
            No standalone nav bar here — CasinoHeader (rendered by the root
            layout above this page) is the page's only top chrome now. */}
        <main>
          {sections}
        </main>
      </div>
    </>
  );
}
