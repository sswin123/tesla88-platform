import Link from 'next/link';
import pool from '@/lib/db';
import PromoBanner from '../PromoBanner';
import type { PublicPromotion } from '@/lib/types';

// 30-second module-level cache — matches the TTL used by getBrand / getHeaderConfig.
// PromotionsSection is an SSR Server Component rendered on every homepage request
// (dynamic = 'force-dynamic'), so without caching it runs 2 pool.query() calls
// per render, contributing to pool exhaustion under concurrent traffic.
let _promoCache:    PublicPromotion[] | null = null;
let _currencyCache: string | null = null;
let _promoCacheAt = 0;
const PROMO_TTL_MS = 30_000;

async function getCurrencySymbol(): Promise<string> {
  if (_currencyCache !== null && Date.now() - _promoCacheAt < PROMO_TTL_MS) {
    return _currencyCache;
  }
  try {
    const { rows } = await pool.query<{ key: string; value: string }>(
      "SELECT key, value FROM system_settings WHERE key IN ('currency_symbol', 'website_currency')"
    );
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    _currencyCache = map['currency_symbol'] ?? map['website_currency'] ?? 'RM';
    return _currencyCache;
  } catch {
    return 'RM';
  }
}

interface PromotionsConfig {
  title?: string;
  subtitle?: string;
  show_all_link?: string;
  max_items?: number;
}

async function getPromotions(limit: number): Promise<PublicPromotion[]> {
  if (_promoCache !== null && Date.now() - _promoCacheAt < PROMO_TTL_MS) {
    return _promoCache;
  }
  try {
    const { rows } = await pool.query<PublicPromotion>(
      `SELECT id, name, description, promotion_type, bonus_type, bonus_value,
              min_deposit, max_bonus, turnover_multiplier, expiry_date
       FROM promotions
       WHERE is_active = TRUE AND deleted_at IS NULL
       ORDER BY id DESC
       LIMIT $1`,
      [limit]
    );
    _promoCache  = rows;
    _promoCacheAt = Date.now();
    return rows;
  } catch {
    return [];
  }
}

export default async function PromotionsSection({ config }: { config: PromotionsConfig }) {
  const { title = '精选优惠', subtitle, show_all_link = '/promotions', max_items = 6 } = config;
  const [promotions, currency] = await Promise.all([
    getPromotions(max_items),
    getCurrencySymbol(),
  ]);
  if (promotions.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-base)' }}>{title}</h2>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
          )}
        </div>
        {show_all_link && (
          <Link href={show_all_link} className="text-xs font-medium" style={{ color: 'var(--brand-primary)' }}>
            查看全部 →
          </Link>
        )}
      </div>
      <PromoBanner promotions={promotions} currency={currency} />
    </section>
  );
}
