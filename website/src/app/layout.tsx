import type { Metadata } from 'next';
import './globals.css';
import pool from '@/lib/db';
import type { WebsiteSettings } from '@/lib/types';

async function getSettings(): Promise<WebsiteSettings> {
  const keys = [
    'site_brand_name','site_primary_color','site_logo_media_id','site_banner_text',
    'site_banner_media_id','site_contact_email','site_contact_phone','site_seo_title',
    'site_seo_description','site_terms_url','website_enabled',
  ];
  try {
    const res = await pool.query<{ key: string; value: string }>(
      'SELECT key, value FROM system_settings WHERE key = ANY($1)', [keys]
    );
    const map = Object.fromEntries(res.rows.map(r => [r.key, r.value]));
    return {
      site_brand_name:      map.site_brand_name      ?? 'Member Portal',
      site_primary_color:   map.site_primary_color   ?? '#3B82F6',
      site_logo_media_id:   map.site_logo_media_id   ?? '',
      site_banner_text:     map.site_banner_text     ?? '',
      site_banner_media_id: map.site_banner_media_id ?? '',
      site_contact_email:   map.site_contact_email   ?? '',
      site_contact_phone:   map.site_contact_phone   ?? '',
      site_seo_title:       map.site_seo_title       ?? 'Member Portal',
      site_seo_description: map.site_seo_description ?? '',
      site_terms_url:       map.site_terms_url        ?? '',
      website_enabled:      map.website_enabled       ?? 'true',
    };
  } catch {
    return {
      site_brand_name: 'Member Portal', site_primary_color: '#3B82F6',
      site_logo_media_id: '', site_banner_text: '', site_banner_media_id: '',
      site_contact_email: '', site_contact_phone: '', site_seo_title: 'Member Portal',
      site_seo_description: '', site_terms_url: '', website_enabled: 'true',
    };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return { title: s.site_seo_title, description: s.site_seo_description || undefined };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const color = s.site_primary_color;
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 flex items-center h-14 gap-6">
            {s.site_logo_media_id
              ? <img src={`/api/public/media/${s.site_logo_media_id}`} alt="logo" className="h-8 w-auto" />
              : <span className="font-bold text-lg" style={{ color }}>{s.site_brand_name}</span>
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
          <p>© {new Date().getFullYear()} {s.site_brand_name}. All rights reserved.</p>
          {(s.site_contact_email || s.site_contact_phone) && (
            <p className="mt-1">
              {s.site_contact_email && <span>Email: {s.site_contact_email}</span>}
              {s.site_contact_email && s.site_contact_phone && ' | '}
              {s.site_contact_phone && <span>Phone: {s.site_contact_phone}</span>}
            </p>
          )}
          {s.site_terms_url && <a href={s.site_terms_url} className="mt-1 inline-block text-gray-400 hover:underline">Terms &amp; Conditions</a>}
        </footer>
      </body>
    </html>
  );
}
