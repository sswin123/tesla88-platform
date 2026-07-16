import Link from 'next/link';
import pool from '@/lib/db';
import PromoBanner from '../PromoBanner';
import type { PublicPromotion } from '@/lib/types';

async function getCurrencySymbol(): Promise<string> {
  try {
    const { rows } = await pool.query<{ key: string; value: string }>(
      "SELECT key, value FROM system_settings WHERE key IN ('currency_symbol', 'website_currency')"
    );
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return map['currency_symbol'] ?? map['website_currency'] ?? 'RM';
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
