import pool from '@/lib/db';
import type { PublicPromotion } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PromotionsPage() {
  const res = await pool.query<PublicPromotion>(
    `SELECT id, name, description, promotion_type, bonus_type, bonus_value,
            min_deposit, max_bonus, turnover_multiplier, expiry_date
     FROM promotions WHERE is_active = TRUE AND deleted_at IS NULL
     AND (expiry_date IS NULL OR expiry_date > NOW()) ORDER BY id DESC`
  );
  const promos = res.rows;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Current Promotions</h1>
      {promos.length === 0 ? (
        <p className="text-gray-500">No active promotions at this time. Check back soon!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {promos.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900">{p.name}</h2>
              {p.description && <p className="text-gray-600 mt-2 text-sm">{p.description}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Bonus:</span> <span className="font-medium">{p.bonus_type === 'PERCENTAGE' ? `${p.bonus_value}%` : `RM ${p.bonus_value}`}</span></div>
                <div><span className="text-gray-500">Min Deposit:</span> <span className="font-medium">RM {p.min_deposit}</span></div>
                {p.max_bonus && <div><span className="text-gray-500">Max Bonus:</span> <span className="font-medium">RM {p.max_bonus}</span></div>}
                <div><span className="text-gray-500">Turnover:</span> <span className="font-medium">{p.turnover_multiplier}×</span></div>
              </div>
              {p.expiry_date && <p className="mt-3 text-xs text-orange-600">Expires: {new Date(p.expiry_date).toLocaleDateString('en-MY')}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
