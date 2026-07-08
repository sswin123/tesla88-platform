import type { Metadata } from 'next';
import './globals.css';
import pool from '@/lib/db';
import type { WebsiteSettings } from '@/lib/types';
import { getBrand } from '@/lib/brand';

export const dynamic = 'force-dynamic';

async function getSettings(): Promise<WebsiteSettings> {
  const keys = [
    'site_banner_text', 'site_banner_media_id',
    'site_contact_email', 'site_contact_phone',
    'site_terms_url', 'website_enabled',
  ];
  try {
    const res = await pool.query<{ key: string; value: string }>(
      'SELECT key, value FROM system_settings WHERE key = ANY($1)', [keys]
    );
    const map = Object.fromEntries(res.rows.map(r => [r.key, r.value]));
    return {
      site_brand_name:      '',
      site_primary_color:   '',
      site_logo_media_id:   '',
      site_banner_text:     map.site_banner_text      ?? '',
      site_banner_media_id: map.site_banner_media_id  ?? '',
      site_contact_email:   map.site_contact_email    ?? '',
      site_contact_phone:   map.site_contact_phone    ?? '',
      site_seo_title:       '',
      site_seo_description: '',
      site_terms_url:       map.site_terms_url        ?? '',
      website_enabled:      map.website_enabled       ?? 'true',
    };
  } catch {
    return {
      site_brand_name: '', site_primary_color: '',
      site_logo_media_id: '', site_banner_text: '', site_banner_media_id: '',
      site_contact_email: '', site_contact_phone: '', site_seo_title: '',
      site_seo_description: '', site_terms_url: '', website_enabled: 'true',
    };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const meta: Metadata = {
    title: brand.seo_title || brand.brand_name,
    description: brand.seo_description || undefined,
  };
  if (brand.favicon_media_id) {
    meta.icons = { icon: `/api/public/media/${brand.favicon_media_id}` };
  }
  return meta;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [s, brand] = await Promise.all([getSettings(), getBrand()]);
  const color = brand.primary_color;
  return (
    <html lang="en" style={{ '--brand-primary': color, '--brand-secondary': brand.secondary_color } as React.CSSProperties}>
      <body className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 flex items-center h-14 gap-6">
            {brand.logo_media_id
              ? <img src={`/api/public/media/${brand.logo_media_id}`} alt="logo" className="h-8 w-auto" />
              : <span className="font-bold text-lg" style={{ color }}>{brand.brand_name}</span>
            }
            <a href="/" className="text-sm text-gray-600 hover:text-gray-900">Home</a>
            <a href="/promotions" className="text-sm text-gray-600 hover:text-gray-900">Promotions</a>
            <a href="/download" className="text-sm text-gray-600 hover:text-gray-900">Download</a>
            <a href="/chat" className="text-sm text-gray-600 hover:text-gray-900">Support</a>
            <div className="ml-auto flex gap-2">
              <a href="/login" className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Login</a>
              <a href="/register" className="px-3 py-1.5 text-sm rounded-md text-white" style={{ background: color }}>Register</a>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-gray-200 mt-16 py-8 text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} {brand.brand_name}. All rights reserved.</p>
          {(s.site_contact_email || s.site_contact_phone || brand.support_whatsapp || brand.telegram_channel) && (
            <p className="mt-1 flex justify-center flex-wrap gap-x-3">
              {s.site_contact_email && <span>Email: {s.site_contact_email}</span>}
              {s.site_contact_phone && <span>Phone: {s.site_contact_phone}</span>}
              {brand.support_whatsapp && <span>WhatsApp: {brand.support_whatsapp}</span>}
              {brand.telegram_channel && <span>Telegram: {brand.telegram_channel}</span>}
            </p>
          )}
          {s.site_terms_url && <a href={s.site_terms_url} className="mt-1 inline-block text-gray-400 hover:underline">Terms &amp; Conditions</a>}
        </footer>
      </body>
    </html>
  );
}
