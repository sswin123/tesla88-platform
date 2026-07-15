import pool from '@/lib/db';
import type { PublicPromotion } from '@/lib/types';

export const dynamic = 'force-dynamic';

function fmtBonus(p: PublicPromotion) {
  return p.bonus_type === 'PERCENTAGE' ? `${p.bonus_value}%` : `RM ${p.bonus_value}`;
}

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
      <h1 className="font-bold mb-4" style={{ fontSize: 'var(--sz-page-title)', color: 'var(--text-base)' }}>
        优惠活动
      </h1>

      {promos.length === 0 ? (
        <div className="casino-card text-center py-12" style={{ padding: 'var(--card-padding)' }}>
          <div className="text-3xl mb-3">🎁</div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>暂无活动，请稍后查看</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 'var(--card-gap)' }}>
          {promos.map(p => (
            <div key={p.id} className="casino-card" style={{ padding: 'var(--card-padding)' }}>
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 className="font-bold leading-tight" style={{ fontSize: 'var(--sz-card-title)', color: 'var(--text-base)' }}>
                  {p.name}
                </h2>
                <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    background: 'color-mix(in srgb, var(--brand-primary) 15%, transparent)',
                    color: 'var(--brand-primary)',
                    border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',
                  }}>
                  {p.bonus_type === 'PERCENTAGE' ? '百分比奖金' : '固定奖金'}
                </span>
              </div>

              {p.description && (
                <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {p.description}
                </p>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: '奖金', value: fmtBonus(p) },
                  { label: '最低存款', value: `RM ${p.min_deposit}` },
                  ...(p.max_bonus ? [{ label: '最高奖金', value: `RM ${p.max_bonus}` }] : []),
                  { label: '流水要求', value: `${p.turnover_multiplier}×` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg px-2.5 py-2"
                    style={{ background: 'var(--bg-surface3)', border: '1px solid var(--border-dim)' }}>
                    <p className="text-xs mb-0.5" style={{ color: 'var(--text-faint)' }}>{label}</p>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between">
                {p.expiry_date ? (
                  <p className="text-xs" style={{ color: '#f59e0b' }}>
                    到期：{new Date(p.expiry_date).toLocaleDateString('zh-CN')}
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: '#22c55e' }}>长期有效</p>
                )}
                <a href="/deposit"
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                  style={{
                    background: 'var(--brand-primary)',
                    color: '#fff',
                  }}>
                  立即参与
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
