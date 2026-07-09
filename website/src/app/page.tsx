import pool from '@/lib/db';
import { getBrand } from '@/lib/brand';
import type { PublicPromotion, WebsiteSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getBannerSettings(): Promise<Partial<WebsiteSettings>> {
  try {
    const res = await pool.query<{ key: string; value: string }>(
      'SELECT key, value FROM system_settings WHERE key = ANY($1)',
      [['site_banner_text', 'site_banner_media_id']]
    );
    return Object.fromEntries(res.rows.map(r => [r.key, r.value])) as Partial<WebsiteSettings>;
  } catch {
    return {};
  }
}

async function getPromotions(): Promise<PublicPromotion[]> {
  try {
    const res = await pool.query<PublicPromotion>(
      `SELECT id, name, description, bonus_type, bonus_value, min_deposit, expiry_date
       FROM promotions WHERE is_active = TRUE AND deleted_at IS NULL
       AND (expiry_date IS NULL OR expiry_date > NOW()) ORDER BY id DESC LIMIT 3`
    );
    return res.rows;
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [s, brand, promotions] = await Promise.all([
    getBannerSettings(),
    getBrand(),
    getPromotions(),
  ]);
  const color = brand.primary_color;

  return (
    <div>
      {/* Hero */}
      <section className="rounded-2xl overflow-hidden mb-12" style={{ background: `linear-gradient(135deg, ${color}20, ${color}10)`, border: `1px solid ${color}30` }}>
        {s.site_banner_media_id && (
          <img src={`/api/public/media/${s.site_banner_media_id}`} alt="banner" className="w-full h-48 object-cover" />
        )}
        <div className="p-10 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {s.site_banner_text || `Welcome to ${brand.brand_name}`}
          </h1>
          <p className="text-gray-600 mb-8">Manage your account, check promotions, and get support anytime.</p>
          <div className="flex gap-4 justify-center">
            <a href="/register" className="px-6 py-3 rounded-lg font-medium btn-brand">Get Started</a>
            <a href="/login"    className="px-6 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">Login</a>
          </div>
        </div>
      </section>

      {/* Top Promotions */}
      {promotions.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Current Promotions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {promotions.map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                {p.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                <p className="mt-3 text-sm font-medium text-brand">
                  {p.bonus_type === 'PERCENTAGE' ? `${p.bonus_value}% bonus` : `RM ${p.bonus_value} bonus`} · Min deposit RM {p.min_deposit}
                </p>
                {p.expiry_date && <p className="text-xs text-gray-400 mt-1">Expires: {new Date(p.expiry_date).toLocaleDateString()}</p>}
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <a href="/promotions" className="text-sm font-medium text-brand">View all promotions →</a>
          </div>
        </section>
      )}

      {/* CTA row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <a href="/download" className="bg-white rounded-xl border border-gray-200 p-6 text-center hover:shadow-md transition-shadow">
          <div className="text-3xl mb-2">📱</div>
          <h3 className="font-semibold">Download App</h3>
          <p className="text-sm text-gray-500 mt-1">Get the Android APK</p>
        </a>
        <a href="/chat" className="bg-white rounded-xl border border-gray-200 p-6 text-center hover:shadow-md transition-shadow">
          <div className="text-3xl mb-2">💬</div>
          <h3 className="font-semibold">Live Support</h3>
          <p className="text-sm text-gray-500 mt-1">Chat with our team</p>
        </a>
        <a href="/dashboard" className="bg-white rounded-xl border border-gray-200 p-6 text-center hover:shadow-md transition-shadow">
          <div className="text-3xl mb-2">👤</div>
          <h3 className="font-semibold">My Account</h3>
          <p className="text-sm text-gray-500 mt-1">Check balance &amp; history</p>
        </a>
      </section>
    </div>
  );
}
